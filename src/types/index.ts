import type { Timestamp } from 'firebase/firestore'

// User profile stored in Firestore
export interface UserProfile {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  riotAccounts: RiotAccount[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Connected Riot account
export interface RiotAccount {
  puuid: string
  gameName: string
  tagLine: string
  region: RiotRegion
  rank?: RankInfo
  lastUpdated: Timestamp
}

export interface RankInfo {
  tier: RankedTier
  division: string
  lp: number
  wins?: number
  losses?: number
}

export type RankedTier =
  | 'IRON'
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'EMERALD'
  | 'DIAMOND'
  | 'MASTER'
  | 'GRANDMASTER'
  | 'CHALLENGER'

export type RiotRegion =
  | 'BR1'
  | 'EUN1'
  | 'EUW1'
  | 'JP1'
  | 'KR'
  | 'LA1'
  | 'LA2'
  | 'NA1'
  | 'OC1'
  | 'PH2'
  | 'RU'
  | 'SG2'
  | 'TH2'
  | 'TR1'
  | 'TW2'
  | 'VN2'

// Scrim/Match types (for future use)
export interface Scrim {
  id: string
  scheduledAt: Timestamp
  createdBy: string
  status: ScrimStatus
  players: ScrimPlayer[]
  games: Game[]
  createdAt: Timestamp
}

export type ScrimStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface ScrimPlayer {
  odId: string
  displayName: string
  riotAccount?: RiotAccount
  team?: 'blue' | 'red'
  role?: PlayerRole
}

export type PlayerRole = 'top' | 'jungle' | 'mid' | 'adc' | 'support'

// Game within a scrim (for fearless draft tracking)
export interface Game {
  gameNumber: number
  blueTeamBans: string[] // Champion IDs
  redTeamBans: string[]
  blueTeamPicks: ChampionPick[]
  redTeamPicks: ChampionPick[]
  winner?: 'blue' | 'red'
  status: GameStatus
}

export type GameStatus = 'pending' | 'drafting' | 'in_progress' | 'completed'

export interface ChampionPick {
  championId: string
  playerId: string
  role: PlayerRole
}

// Fearless draft - accumulated bans across games
export interface FearlessDraftState {
  scrimId: string
  gamesPlayed: number
  bannedChampions: string[] // All champions banned or picked in previous games
}

// Match history
export interface MatchInfo {
  matchId: string
  gameCreation: number
  gameDuration: number
  gameMode: string
  queueId: number
  win: boolean
  championId: number
  championName: string
  kills: number
  deaths: number
  assists: number
  cs: number
  csPerMin: number
  visionScore: number
  totalDamageDealt: number
  goldEarned: number
  role: string
  lane: string
}

// ============================================
// MMR System Types
// ============================================

// Player's MMR data stored in Firestore
export interface PlayerMMR {
  odId: string
  mmr: number
  placementGamesPlayed: number
  isPlaced: boolean
  gamesPlayed: number
  wins: number
  losses: number
  peakMmr: number
  lastUpdated: Timestamp
  history: MMRHistoryEntry[]
}

// Single MMR change history entry
export interface MMRHistoryEntry {
  matchId: string
  mmrBefore: number
  mmrAfter: number
  change: number
  performanceScore: number
  timestamp: Timestamp
}

// Display rank derived from MMR
export type MMRRank =
  | 'IRON'
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'EMERALD'
  | 'DIAMOND'
  | 'MASTER'
  | 'GRANDMASTER'
  | 'CHALLENGER'

// Scrim match for platform games
export interface ScrimMatch {
  id: string
  createdAt: Timestamp
  createdBy: string
  status: ScrimMatchStatus
  blueTeam: ScrimTeamData
  redTeam: ScrimTeamData
  winner?: 'blue' | 'red'
  playerStats: PlayerMatchStats[]
  mmrProcessed: boolean
}

export type ScrimMatchStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

// Team data within a scrim match
export interface ScrimTeamData {
  players: ScrimMatchPlayer[]
  avgMmr: number
}

// Player in a scrim match
export interface ScrimMatchPlayer {
  odId: string
  oduid: string
  displayName: string
  role: PlayerRole
  mmrAtTime: number
}

// Individual player stats for a match
export interface PlayerMatchStats {
  odId: string
  oduid: string
  team: 'blue' | 'red'
  champion: string
  role: PlayerRole
  kills: number
  deaths: number
  assists: number
  cs: number
  damage: number
  visionScore: number
  objectiveScore: number
  // Calculated fields
  performanceScore?: number
  mmrChange?: number
}

// Performance breakdown for display
export interface PerformanceBreakdown {
  kdaScore: number
  damageScore: number
  csScore: number
  visionScore: number
  objectiveScore: number
  totalScore: number
  multiplier: number
}

// Leaderboard entry
export interface LeaderboardEntry {
  position: number
  odId: string
  oduid: string
  displayName: string
  photoURL?: string
  mmr: number
  rank: MMRRank
  gamesPlayed: number
  wins: number
  losses: number
  winRate: number
  isPlaced: boolean
}

// ============================================
// Queue System Types
// ============================================

// Player in the queue
export interface QueueEntry {
  odId: string
  oduid: string
  displayName: string
  photoURL?: string
  role: PlayerRole
  mmr: number
  joinedAt: Timestamp
  region: RiotRegion
}

// Queue state for real-time updates
export interface QueueState {
  playersInQueue: number
  roleCount: Record<PlayerRole, number>
  estimatedWaitTime?: number
}

// ============================================
// Draft System Types
// ============================================

// Draft phase types
export type DraftPhaseType = 'ban' | 'pick'
export type DraftTeam = 'blue' | 'red'

// Individual draft action (ban or pick)
export interface DraftAction {
  phase: number
  type: DraftPhaseType
  team: DraftTeam
  role: PlayerRole
  championId?: string
  championName?: string
  completedAt?: Timestamp
  isActive: boolean
}

// Player in a draft
export interface DraftPlayer {
  odId: string
  oduid: string
  displayName: string
  photoURL?: string
  role: PlayerRole
  team: DraftTeam
  mmr: number
  championId?: string
  championName?: string
  isReady: boolean
}

// Complete draft session
export interface DraftSession {
  id: string
  createdAt: Timestamp
  status: DraftStatus
  currentPhase: number
  currentTeam: DraftTeam
  phaseType: DraftPhaseType
  phaseStartedAt: Timestamp
  phaseTimeLimit: number // seconds
  
  blueTeam: DraftPlayer[]
  redTeam: DraftPlayer[]
  blueTeamAvgMmr: number
  redTeamAvgMmr: number
  
  // Draft order: 0-5 are bans, 6-15 are picks
  actions: DraftAction[]
  
  // Banned champions (both teams)
  bannedChampions: string[]
  
  // For fearless mode (optional)
  fearlessMode?: boolean
  previouslyUsedChampions?: string[]
}

export type DraftStatus = 
  | 'waiting'      // Waiting for players to ready up
  | 'banning'      // Ban phase
  | 'picking'      // Pick phase
  | 'completed'    // Draft finished
  | 'cancelled'    // Draft was cancelled

// Champion data from Riot Data Dragon
export interface Champion {
  id: string        // e.g., "Aatrox"
  key: string       // e.g., "266"
  name: string      // e.g., "Aatrox"
  title: string     // e.g., "the Darkin Blade"
  image: string     // URL to champion image
  tags: string[]    // e.g., ["Fighter", "Tank"]
}

// Draft result for post-draft lobby
export interface DraftResult {
  draftId: string
  blueTeam: {
    players: DraftPlayer[]
    bans: string[]
    avgMmr: number
  }
  redTeam: {
    players: DraftPlayer[]
    bans: string[]
    avgMmr: number
  }
  lobbyName: string
  lobbyPassword: string
  createdAt: Timestamp
}
