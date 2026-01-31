import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useDraft, useChampions } from '@/hooks/useDraft'
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
import { Badge } from '@/components/ui/badge'
import { Loader2, Copy, Check, Gamepad2, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import type { Champion, DraftPlayer, PlayerRole } from '@/types'

const ROLE_ORDER: PlayerRole[] = ['top', 'jungle', 'mid', 'adc', 'support']
const ROLE_LABELS: Record<PlayerRole, string> = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  adc: 'ADC',
  support: 'Support',
}

export default function Lobby() {
  const { draftId } = useParams<{ draftId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { draft, loading, error } = useDraft(draftId || null, user?.uid)
  const { champions } = useChampions()
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    )
  }

  if (error || !draft) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-destructive">
            {error || 'Draft not found'}
          </h1>
          <Button onClick={() => navigate('/queue')} className="mt-4">
            Back to Queue
          </Button>
        </div>
      </Layout>
    )
  }

  if (draft.status !== 'completed') {
    navigate(`/draft/${draftId}`)
    return null
  }

  const getChampion = (id: string | undefined) => champions.find(c => c.id === id)
  const lobbyName = (draft as unknown as { lobbyName?: string }).lobbyName || `Drafty-${draftId?.slice(0, 8)}`
  const lobbyPassword = (draft as unknown as { lobbyPassword?: string }).lobbyPassword || 'drafty123'

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <Badge variant="secondary" className="mb-4">Draft Complete</Badge>
          <h1 className="text-3xl font-bold">Game Lobby</h1>
          <p className="text-muted-foreground mt-2">
            Create a custom game in League of Legends with the settings below
          </p>
        </div>

        {/* Lobby Details Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5" />
              Custom Game Details
            </CardTitle>
            <CardDescription>
              Use these settings to create your custom game
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Lobby Name</p>
                  <p className="font-mono font-medium">{lobbyName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(lobbyName, 'name')}
                >
                  {copiedField === 'name' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Password</p>
                  <p className="font-mono font-medium">{lobbyPassword}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(lobbyPassword, 'password')}
                >
                  {copiedField === 'password' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-4 p-4 border rounded-lg bg-card">
              <h4 className="font-medium mb-2">How to create the game:</h4>
              <ol className="text-sm text-muted-foreground space-y-1">
                <li>1. Open League of Legends client</li>
                <li>2. Go to Play → Custom → Create Custom</li>
                <li>3. Set Game Type to "Tournament Draft"</li>
                <li>4. Enter the Lobby Name and Password above</li>
                <li>5. Invite your teammates and have the opposing team join</li>
                <li>6. Blue team members should join Blue side, Red team join Red side</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Teams Display */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Blue Team */}
          <Card className="border-blue-500/30">
            <CardHeader className="border-b border-blue-500/20 bg-blue-500/5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-blue-500">Blue Team</CardTitle>
                <Badge variant="outline" className="text-blue-500 border-blue-500/30">
                  {Math.round(draft.blueTeamAvgMmr)} MMR
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {ROLE_ORDER.map(role => {
                  const player = draft.blueTeam.find(p => p.role === role)
                  if (!player) return null
                  const champion = getChampion(player.championId)
                  return (
                    <TeamPlayerRow
                      key={player.odId}
                      player={player}
                      champion={champion}
                      role={role}
                      isCurrentUser={player.odId === user?.uid}
                    />
                  )
                })}
              </div>

              {/* Bans */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2">BANS</p>
                <div className="flex gap-2">
                  {draft.actions
                    .filter(a => a.type === 'ban' && a.team === 'blue' && a.championId)
                    .map((action, i) => {
                      const champ = getChampion(action.championId!)
                      return champ ? (
                        <div key={i} className="relative w-10 h-10 rounded overflow-hidden grayscale opacity-60">
                          <img src={champ.image} alt={champ.name} className="w-full h-full object-cover" />
                        </div>
                      ) : null
                    })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Red Team */}
          <Card className="border-red-500/30">
            <CardHeader className="border-b border-red-500/20 bg-red-500/5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-red-500">Red Team</CardTitle>
                <Badge variant="outline" className="text-red-500 border-red-500/30">
                  {Math.round(draft.redTeamAvgMmr)} MMR
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {ROLE_ORDER.map(role => {
                  const player = draft.redTeam.find(p => p.role === role)
                  if (!player) return null
                  const champion = getChampion(player.championId)
                  return (
                    <TeamPlayerRow
                      key={player.odId}
                      player={player}
                      champion={champion}
                      role={role}
                      isCurrentUser={player.odId === user?.uid}
                    />
                  )
                })}
              </div>

              {/* Bans */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2">BANS</p>
                <div className="flex gap-2">
                  {draft.actions
                    .filter(a => a.type === 'ban' && a.team === 'red' && a.championId)
                    .map((action, i) => {
                      const champ = getChampion(action.championId!)
                      return champ ? (
                        <div key={i} className="relative w-10 h-10 rounded overflow-hidden grayscale opacity-60">
                          <img src={champ.image} alt={champ.name} className="w-full h-full object-cover" />
                        </div>
                      ) : null
                    })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={() => navigate('/queue')}>
            Back to Queue
          </Button>
          <Button onClick={() => navigate('/submit-match')}>
            Submit Match Result
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </Layout>
  )
}

function TeamPlayerRow({
  player,
  champion,
  role,
  isCurrentUser,
}: {
  player: DraftPlayer
  champion: Champion | undefined
  role: PlayerRole
  isCurrentUser: boolean
}) {
  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg ${
      isCurrentUser ? 'bg-primary/10 border border-primary/30' : ''
    }`}>
      {champion ? (
        <img src={champion.image} alt={champion.name} className="w-12 h-12 rounded" />
      ) : (
        <div className="w-12 h-12 rounded bg-muted" />
      )}
      <div className="flex-1">
        <p className="font-medium">
          {champion?.name || 'No Pick'}
          {isCurrentUser && <span className="text-primary text-sm ml-2">(You)</span>}
        </p>
        <p className="text-sm text-muted-foreground">{player.displayName}</p>
      </div>
      <Badge variant="outline" className="text-xs">
        {ROLE_LABELS[role]}
      </Badge>
    </div>
  )
}
