import { useLeaderboard, useMMR } from '@/hooks/useMMR'
import { useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MMRBadge, MMRStats } from '@/components/MMRBadge'
import { getRankColor } from '@/lib/mmr'
import { Loader2, RefreshCw, Trophy, Medal, Award } from 'lucide-react'
import type { MMRRank } from '@/lib/mmr'

function getPositionIcon(position: number) {
  switch (position) {
    case 1:
      return <Trophy className="h-5 w-5 text-yellow-500" />
    case 2:
      return <Medal className="h-5 w-5 text-gray-400" />
    case 3:
      return <Award className="h-5 w-5 text-amber-700" />
    default:
      return <span className="text-muted-foreground font-mono w-5 text-center">{position}</span>
  }
}

export default function Leaderboard() {
  const { user } = useAuth()
  const { leaderboard, loading, error, fetchLeaderboard } = useLeaderboard()
  const { mmr: myMmr, initializeMMR, loading: mmrLoading } = useMMR(user?.uid)

  const initials = (name: string) =>
    name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Leaderboard</h1>
            <p className="text-muted-foreground mt-1">
              Top players ranked by MMR
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLeaderboard()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Your MMR Card */}
        {user && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Your MMR</CardTitle>
              <CardDescription>
                Your current standing in the ranking system
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myMmr ? (
                <div className="flex items-center justify-between">
                  <MMRBadge
                    mmr={myMmr.mmr}
                    rank={myMmr.rank as MMRRank}
                    isPlaced={myMmr.isPlaced}
                    placementGamesPlayed={myMmr.placementGamesPlayed}
                    size="lg"
                    showProgress
                  />
                  <MMRStats
                    wins={myMmr.wins}
                    losses={myMmr.losses}
                    winRate={myMmr.winRate}
                    gamesPlayed={myMmr.gamesPlayed}
                    peakMmr={myMmr.peakMmr}
                  />
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground mb-4">
                    You haven't been placed yet. Initialize your MMR to start playing ranked scrims.
                  </p>
                  <Button onClick={initializeMMR} disabled={mmrLoading}>
                    {mmrLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Initializing...
                      </>
                    ) : (
                      'Initialize MMR'
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>Rankings</CardTitle>
            <CardDescription>
              Players who have completed placement games
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && leaderboard.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">
                {error}
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No players have completed placement yet.
                <br />
                Be the first to get ranked!
              </div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((player) => (
                  <div
                    key={player.odId}
                    className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                      player.odId === user?.uid
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {/* Position */}
                    <div className="w-8 flex justify-center">
                      {getPositionIcon(player.position)}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={player.photoURL} alt={player.displayName} />
                      <AvatarFallback>{initials(player.displayName)}</AvatarFallback>
                    </Avatar>

                    {/* Name & Rank */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {player.displayName}
                        {player.odId === user?.uid && (
                          <span className="text-primary ml-2 text-sm">(You)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {player.gamesPlayed} games • {player.winRate}% WR
                      </p>
                    </div>

                    {/* MMR */}
                    <div className="text-right">
                      <p className={`font-semibold ${getRankColor(player.rank)}`}>
                        {player.rank}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {player.mmr.toLocaleString()} MMR
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
