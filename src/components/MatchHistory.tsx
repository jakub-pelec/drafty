import { useState } from 'react'
import { useMatchHistory } from '@/hooks/useMatchHistory'
import { Button } from '@/components/ui/button'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import type { RiotAccount, MatchInfo } from '@/types'

interface MatchHistoryProps {
  account: RiotAccount
}

// Champion icon URL from Data Dragon
function getChampionIconUrl(championName: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/${championName}.png`
}

// Format game duration
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Format time ago
function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

// Role icons/labels
function getRoleLabel(role: string): string {
  const roles: Record<string, string> = {
    TOP: 'Top',
    JUNGLE: 'Jungle',
    MIDDLE: 'Mid',
    BOTTOM: 'ADC',
    UTILITY: 'Support',
    UNKNOWN: '',
  }
  return roles[role] || role
}

export function MatchHistory({ account }: MatchHistoryProps) {
  const { fetchMatches, getMatchesForAccount, loading, error } = useMatchHistory()
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const matches = getMatchesForAccount(account.puuid)

  async function handleLoadMatches() {
    if (!loaded) {
      await fetchMatches(account.puuid, account.region, 5)
      setLoaded(true)
    }
    setExpanded(!expanded)
  }

  // Calculate stats summary
  const stats = matches.length > 0 ? {
    wins: matches.filter(m => m.win).length,
    losses: matches.filter(m => !m.win).length,
    avgKills: (matches.reduce((sum, m) => sum + m.kills, 0) / matches.length).toFixed(1),
    avgDeaths: (matches.reduce((sum, m) => sum + m.deaths, 0) / matches.length).toFixed(1),
    avgAssists: (matches.reduce((sum, m) => sum + m.assists, 0) / matches.length).toFixed(1),
    avgCs: Math.round(matches.reduce((sum, m) => sum + m.csPerMin, 0) / matches.length * 10) / 10,
  } : null

  return (
    <div className="mt-3 border-t pt-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLoadMatches}
        disabled={loading}
        className="w-full justify-between"
      >
        <span>Recent Ranked Games</span>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {stats && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3 px-2">
              <span className="text-green-500">{stats.wins}W</span>
              <span className="text-red-500">{stats.losses}L</span>
              <span>|</span>
              <span>{stats.avgKills}/{stats.avgDeaths}/{stats.avgAssists} KDA</span>
              <span>|</span>
              <span>{stats.avgCs} CS/min</span>
            </div>
          )}

          {matches.length === 0 && !loading && !error && (
            <p className="text-sm text-muted-foreground px-2">No ranked games found</p>
          )}

          {matches.map((match) => (
            <MatchCard key={match.matchId} match={match} />
          ))}
        </div>
      )}
    </div>
  )
}

function MatchCard({ match }: { match: MatchInfo }) {
  const kda = match.deaths === 0 
    ? 'Perfect' 
    : ((match.kills + match.assists) / match.deaths).toFixed(2)

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg border ${
        match.win 
          ? 'bg-green-500/10 border-green-500/20' 
          : 'bg-red-500/10 border-red-500/20'
      }`}
    >
      {/* Champion Icon */}
      <img
        src={getChampionIconUrl(match.championName)}
        alt={match.championName}
        className="w-10 h-10 rounded"
      />

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${match.win ? 'text-green-500' : 'text-red-500'}`}>
            {match.win ? 'Victory' : 'Defeat'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDuration(match.gameDuration)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTimeAgo(match.gameCreation)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">
            {match.kills}/{match.deaths}/{match.assists}
          </span>
          <span className="text-muted-foreground">
            {kda} KDA
          </span>
          {getRoleLabel(match.role) && (
            <span className="text-xs text-muted-foreground">
              {getRoleLabel(match.role)}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="text-right text-xs text-muted-foreground hidden sm:block">
        <div>{match.cs} CS ({match.csPerMin}/min)</div>
        <div>{(match.totalDamageDealt / 1000).toFixed(1)}k dmg</div>
      </div>
    </div>
  )
}
