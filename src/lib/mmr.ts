/**
 * Client-side MMR utilities
 */

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

export type MMRRank = typeof MMR_RANK_THRESHOLDS[number]['rank']

/**
 * Get display rank from MMR value
 */
export function getRankFromMMR(mmr: number): MMRRank {
  for (const threshold of MMR_RANK_THRESHOLDS) {
    if (mmr >= threshold.min && mmr <= threshold.max) {
      return threshold.rank
    }
  }
  return 'IRON'
}

/**
 * Get rank color class for styling
 */
export function getRankColor(rank: string): string {
  const colors: Record<string, string> = {
    IRON: 'text-gray-500',
    BRONZE: 'text-amber-700',
    SILVER: 'text-gray-400',
    GOLD: 'text-yellow-500',
    PLATINUM: 'text-cyan-500',
    EMERALD: 'text-emerald-500',
    DIAMOND: 'text-blue-400',
    MASTER: 'text-purple-500',
    GRANDMASTER: 'text-red-500',
    CHALLENGER: 'text-amber-400',
  }
  return colors[rank] || 'text-foreground'
}

/**
 * Get rank background color class
 */
export function getRankBgColor(rank: string): string {
  const colors: Record<string, string> = {
    IRON: 'bg-gray-500/10',
    BRONZE: 'bg-amber-700/10',
    SILVER: 'bg-gray-400/10',
    GOLD: 'bg-yellow-500/10',
    PLATINUM: 'bg-cyan-500/10',
    EMERALD: 'bg-emerald-500/10',
    DIAMOND: 'bg-blue-400/10',
    MASTER: 'bg-purple-500/10',
    GRANDMASTER: 'bg-red-500/10',
    CHALLENGER: 'bg-amber-400/10',
  }
  return colors[rank] || 'bg-muted'
}

/**
 * Get progress to next rank (0-100)
 */
export function getProgressToNextRank(mmr: number): number {
  const currentThreshold = MMR_RANK_THRESHOLDS.find(
    t => mmr >= t.min && mmr <= t.max
  )
  
  if (!currentThreshold || currentThreshold.max === Infinity) {
    return 100
  }

  const range = currentThreshold.max - currentThreshold.min
  const progress = mmr - currentThreshold.min
  return Math.round((progress / range) * 100)
}

/**
 * Format MMR for display
 */
export function formatMMR(mmr: number): string {
  return mmr.toLocaleString()
}

/**
 * Get placement status string
 */
export function getPlacementStatus(gamesPlayed: number, totalRequired: number): string {
  if (gamesPlayed >= totalRequired) {
    return 'Placed'
  }
  return `Placement ${gamesPlayed}/${totalRequired}`
}

/**
 * Calculate win rate
 */
export function calculateWinRate(wins: number, losses: number): number {
  const total = wins + losses
  if (total === 0) return 0
  return Math.round((wins / total) * 100)
}
