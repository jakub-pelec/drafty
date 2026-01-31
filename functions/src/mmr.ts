/**
 * MMR Calculation System
 * 
 * This module handles all MMR-related calculations including:
 * - Initial MMR seeding from Riot rank
 * - Performance score calculation
 * - MMR change calculation
 * - Rank determination from MMR
 */

// Base MMR values for each Riot rank tier
export const RANK_TO_MMR: Record<string, number> = {
  IRON: 400,
  BRONZE: 600,
  SILVER: 800,
  GOLD: 1000,
  PLATINUM: 1200,
  EMERALD: 1400,
  DIAMOND: 1600,
  MASTER: 1800,
  GRANDMASTER: 2000,
  CHALLENGER: 2200,
  UNRANKED: 800, // Default to Silver equivalent
}

// MMR ranges for display ranks
export const MMR_RANK_THRESHOLDS = [
  { min: 0, max: 499, rank: 'IRON' },
  { min: 500, max: 699, rank: 'BRONZE' },
  { min: 700, max: 899, rank: 'SILVER' },
  { min: 900, max: 1099, rank: 'GOLD' },
  { min: 1100, max: 1299, rank: 'PLATINUM' },
  { min: 1300, max: 1499, rank: 'EMERALD' },
  { min: 1500, max: 1699, rank: 'DIAMOND' },
  { min: 1700, max: 1899, rank: 'MASTER' },
  { min: 1900, max: 2099, rank: 'GRANDMASTER' },
  { min: 2100, max: Infinity, rank: 'CHALLENGER' },
] as const

// Constants for MMR calculation
export const MMR_CONFIG = {
  BASE_CHANGE: 25, // Standard K-factor
  PLACEMENT_MULTIPLIER: 2, // Double gains during placement
  PLACEMENT_GAMES: 5,
  MIN_MMR: 100,
  MAX_MMR: 3000,
  
  // Performance weights (must sum to 1.0)
  PERFORMANCE_WEIGHTS: {
    kda: 0.30,
    damage: 0.25,
    cs: 0.20,
    vision: 0.15,
    objective: 0.10,
  },
  
  // Performance multiplier range
  MIN_PERFORMANCE_MULTIPLIER: 0.5,
  MAX_PERFORMANCE_MULTIPLIER: 1.5,
  
  // Opponent strength multiplier range
  MIN_OPPONENT_MULTIPLIER: 0.8,
  MAX_OPPONENT_MULTIPLIER: 1.2,
}

export interface PlayerStats {
  odId: string
  team: 'blue' | 'red'
  kills: number
  deaths: number
  assists: number
  cs: number
  damage: number
  visionScore: number
  objectiveScore: number
  mmrAtTime: number
}

export interface MatchContext {
  winner: 'blue' | 'red'
  blueTeamAvgMmr: number
  redTeamAvgMmr: number
  allPlayerStats: PlayerStats[]
}

/**
 * Get initial MMR based on highest Riot rank from connected accounts
 */
export function getInitialMMR(riotRanks: { tier: string }[]): number {
  if (!riotRanks || riotRanks.length === 0) {
    return RANK_TO_MMR.UNRANKED
  }

  // Find highest rank
  const rankOrder = [
    'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
    'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'
  ]

  let highestRankIndex = -1
  for (const rank of riotRanks) {
    const index = rankOrder.indexOf(rank.tier?.toUpperCase())
    if (index > highestRankIndex) {
      highestRankIndex = index
    }
  }

  if (highestRankIndex === -1) {
    return RANK_TO_MMR.UNRANKED
  }

  const highestRank = rankOrder[highestRankIndex]
  return RANK_TO_MMR[highestRank] || RANK_TO_MMR.UNRANKED
}

/**
 * Get display rank from MMR value
 */
export function getRankFromMMR(mmr: number): string {
  for (const threshold of MMR_RANK_THRESHOLDS) {
    if (mmr >= threshold.min && mmr <= threshold.max) {
      return threshold.rank
    }
  }
  return 'IRON'
}

/**
 * Calculate performance score for a player (0-100)
 */
export function calculatePerformanceScore(
  playerStats: PlayerStats,
  allStats: PlayerStats[]
): { score: number; breakdown: PerformanceBreakdown } {
  // Calculate averages for the match
  const avgKills = average(allStats.map(s => s.kills))
  const avgDeaths = average(allStats.map(s => s.deaths))
  const avgAssists = average(allStats.map(s => s.assists))
  const avgDamage = average(allStats.map(s => s.damage))
  const avgCs = average(allStats.map(s => s.cs))
  const avgVision = average(allStats.map(s => s.visionScore))
  const avgObjective = average(allStats.map(s => s.objectiveScore))

  // Calculate KDA score (0-100)
  const playerKda = playerStats.deaths === 0 
    ? (playerStats.kills + playerStats.assists) * 2 
    : (playerStats.kills + playerStats.assists) / playerStats.deaths
  const avgKda = avgDeaths === 0 
    ? (avgKills + avgAssists) * 2 
    : (avgKills + avgAssists) / avgDeaths
  const kdaScore = normalizeScore(playerKda, avgKda)

  // Calculate damage score (0-100)
  const damageScore = normalizeScore(playerStats.damage, avgDamage)

  // Calculate CS score (0-100)
  const csScore = normalizeScore(playerStats.cs, avgCs)

  // Calculate vision score (0-100)
  const visionScoreVal = normalizeScore(playerStats.visionScore, avgVision)

  // Calculate objective score (0-100)
  const objectiveScoreVal = normalizeScore(playerStats.objectiveScore, avgObjective)

  // Weight the scores
  const weights = MMR_CONFIG.PERFORMANCE_WEIGHTS
  const totalScore = 
    (kdaScore * weights.kda) +
    (damageScore * weights.damage) +
    (csScore * weights.cs) +
    (visionScoreVal * weights.vision) +
    (objectiveScoreVal * weights.objective)

  // Convert to multiplier (0.5 to 1.5)
  const multiplier = scoreToMultiplier(totalScore)

  return {
    score: Math.round(totalScore),
    breakdown: {
      kdaScore: Math.round(kdaScore),
      damageScore: Math.round(damageScore),
      csScore: Math.round(csScore),
      visionScore: Math.round(visionScoreVal),
      objectiveScore: Math.round(objectiveScoreVal),
      totalScore: Math.round(totalScore),
      multiplier: Math.round(multiplier * 100) / 100,
    }
  }
}

interface PerformanceBreakdown {
  kdaScore: number
  damageScore: number
  csScore: number
  visionScore: number
  objectiveScore: number
  totalScore: number
  multiplier: number
}

/**
 * Calculate MMR change for a player
 */
export function calculateMMRChange(
  playerStats: PlayerStats,
  context: MatchContext,
  isPlacement: boolean
): { change: number; performanceScore: number; breakdown: PerformanceBreakdown } {
  const { winner, blueTeamAvgMmr, redTeamAvgMmr, allPlayerStats } = context
  const didWin = playerStats.team === winner

  // Calculate performance score
  const { score: performanceScore, breakdown } = calculatePerformanceScore(
    playerStats,
    allPlayerStats
  )

  // Base change
  let change = MMR_CONFIG.BASE_CHANGE

  // Win/Loss multiplier
  change *= didWin ? 1 : -1

  // Performance multiplier (affects magnitude, not direction)
  const performanceMultiplier = breakdown.multiplier
  change *= performanceMultiplier

  // Opponent strength multiplier
  const opponentTeamAvgMmr = playerStats.team === 'blue' ? redTeamAvgMmr : blueTeamAvgMmr
  const opponentMultiplier = calculateOpponentMultiplier(
    playerStats.mmrAtTime,
    opponentTeamAvgMmr,
    didWin
  )
  change *= opponentMultiplier

  // Placement period multiplier
  if (isPlacement) {
    change *= MMR_CONFIG.PLACEMENT_MULTIPLIER
  }

  // Round to whole number
  change = Math.round(change)

  return {
    change,
    performanceScore,
    breakdown,
  }
}

/**
 * Calculate opponent strength multiplier
 * - Win against stronger opponents = more points
 * - Lose against weaker opponents = lose more points
 */
function calculateOpponentMultiplier(
  playerMmr: number,
  opponentAvgMmr: number,
  didWin: boolean
): number {
  const mmrDiff = opponentAvgMmr - playerMmr
  
  // Expected outcome probability (simplified Elo formula)
  const expectedWin = 1 / (1 + Math.pow(10, mmrDiff / 400))
  
  let multiplier: number
  if (didWin) {
    // Won: higher multiplier for beating stronger opponents
    multiplier = 1 + (1 - expectedWin) * 0.4 // Range: 1.0 to 1.4
  } else {
    // Lost: higher multiplier for losing to weaker opponents
    multiplier = 1 + expectedWin * 0.4 // Range: 1.0 to 1.4
  }

  // Clamp to configured range
  return clamp(
    multiplier,
    MMR_CONFIG.MIN_OPPONENT_MULTIPLIER,
    MMR_CONFIG.MAX_OPPONENT_MULTIPLIER
  )
}

/**
 * Apply MMR change and ensure bounds
 */
export function applyMMRChange(currentMmr: number, change: number): number {
  const newMmr = currentMmr + change
  return clamp(newMmr, MMR_CONFIG.MIN_MMR, MMR_CONFIG.MAX_MMR)
}

// ============================================
// Utility Functions
// ============================================

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
}

/**
 * Normalize a value compared to average (0-100 scale)
 * 50 = average, 100 = 2x average, 0 = 0
 */
function normalizeScore(value: number, avg: number): number {
  if (avg === 0) return 50
  const ratio = value / avg
  // Scale: 0.5x = 25, 1x = 50, 2x = 100
  const score = ratio * 50
  return clamp(score, 0, 100)
}

/**
 * Convert performance score (0-100) to multiplier (0.5-1.5)
 */
function scoreToMultiplier(score: number): number {
  // 0 -> 0.5, 50 -> 1.0, 100 -> 1.5
  const multiplier = 0.5 + (score / 100)
  return clamp(
    multiplier,
    MMR_CONFIG.MIN_PERFORMANCE_MULTIPLIER,
    MMR_CONFIG.MAX_PERFORMANCE_MULTIPLIER
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
