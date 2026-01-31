import { getRankColor, getRankBgColor, getProgressToNextRank, getPlacementStatus } from '@/lib/mmr'
import type { MMRRank } from '@/lib/mmr'

interface MMRBadgeProps {
  mmr: number
  rank: MMRRank
  isPlaced: boolean
  placementGamesPlayed?: number
  placementGamesRequired?: number
  showProgress?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function MMRBadge({
  mmr,
  rank,
  isPlaced,
  placementGamesPlayed = 0,
  placementGamesRequired = 5,
  showProgress = false,
  size = 'md',
}: MMRBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  }

  const progress = getProgressToNextRank(mmr)

  if (!isPlaced) {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full bg-muted ${sizeClasses[size]}`}>
        <span className="text-muted-foreground">
          {getPlacementStatus(placementGamesPlayed, placementGamesRequired)}
        </span>
      </div>
    )
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <div
        className={`inline-flex items-center gap-2 rounded-full ${getRankBgColor(rank)} ${sizeClasses[size]}`}
      >
        <span className={`font-semibold ${getRankColor(rank)}`}>
          {rank}
        </span>
        <span className="text-muted-foreground">
          {mmr.toLocaleString()} MMR
        </span>
      </div>
      
      {showProgress && rank !== 'CHALLENGER' && (
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full ${getRankBgColor(rank).replace('/10', '/50')}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

interface MMRChangeProps {
  change: number
  size?: 'sm' | 'md' | 'lg'
}

export function MMRChange({ change, size = 'md' }: MMRChangeProps) {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  const isPositive = change > 0
  const color = isPositive ? 'text-green-500' : 'text-red-500'
  const prefix = isPositive ? '+' : ''

  return (
    <span className={`font-medium ${color} ${sizeClasses[size]}`}>
      {prefix}{change} MMR
    </span>
  )
}

interface MMRStatsProps {
  wins: number
  losses: number
  winRate: number
  gamesPlayed: number
  peakMmr?: number
}

export function MMRStats({ wins, losses, winRate, gamesPlayed, peakMmr }: MMRStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <p className="text-muted-foreground">Games</p>
        <p className="font-medium">{gamesPlayed}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Win Rate</p>
        <p className="font-medium">{winRate}%</p>
      </div>
      <div>
        <p className="text-muted-foreground">Record</p>
        <p className="font-medium">
          <span className="text-green-500">{wins}W</span>
          {' / '}
          <span className="text-red-500">{losses}L</span>
        </p>
      </div>
      {peakMmr !== undefined && (
        <div>
          <p className="text-muted-foreground">Peak MMR</p>
          <p className="font-medium">{peakMmr.toLocaleString()}</p>
        </div>
      )}
    </div>
  )
}
