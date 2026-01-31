import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useDraft, useChampions } from '@/hooks/useDraft'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, Clock, Check, X } from 'lucide-react'
import type { Champion, DraftPlayer, PlayerRole } from '@/types'

const ROLE_ORDER: PlayerRole[] = ['top', 'jungle', 'mid', 'adc', 'support']

export default function Draft() {
  const { draftId } = useParams<{ draftId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { draft, loading, error, timeRemaining, setReady, makeAction, timeoutDraft, isMyTurn, getMyTeam } = useDraft(
    draftId || null,
    user?.uid
  )
  const { champions, loading: championsLoading } = useChampions()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Redirect to lobby when draft is completed
  useEffect(() => {
    if (draft?.status === 'completed' && draftId) {
      navigate(`/lobby/${draftId}`)
    }
  }, [draft?.status, draftId, navigate])

  // Auto-timeout when timer reaches 0
  useEffect(() => {
    if (timeRemaining === 0 && draft && ['banning', 'picking'].includes(draft.status)) {
      timeoutDraft()
    }
  }, [timeRemaining, draft, timeoutDraft])

  // Filter champions based on search and availability
  const availableChampions = useMemo(() => {
    if (!champions || !draft) return []

    const bannedIds = draft.bannedChampions || []
    const pickedIds = draft.actions
      .filter(a => a.type === 'pick' && a.championId)
      .map(a => a.championId)

    return champions.filter(champ => {
      // Filter by search
      const matchesSearch = champ.name.toLowerCase().includes(searchQuery.toLowerCase())
      // Filter out banned/picked champions
      const isAvailable = !bannedIds.includes(champ.id) && !pickedIds.includes(champ.id)
      return matchesSearch && isAvailable
    })
  }, [champions, draft, searchQuery])

  const handleLockIn = async () => {
    if (!selectedChampion) return

    setIsSubmitting(true)
    await makeAction(selectedChampion.id, selectedChampion.name)
    setSelectedChampion(null)
    setIsSubmitting(false)
  }

  if (loading || championsLoading) {
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

  if (draft.status === 'cancelled') {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-destructive">Draft Cancelled</h1>
          <p className="text-muted-foreground mt-2">
            The draft was cancelled due to a timeout or player disconnect.
          </p>
          <Button onClick={() => navigate('/queue')} className="mt-4">
            Back to Queue
          </Button>
        </div>
      </Layout>
    )
  }

  // Waiting for players to ready up
  if (draft.status === 'waiting') {
    const myPlayer = [...draft.blueTeam, ...draft.redTeam].find(p => p.odId === user?.uid)
    const allPlayers = [...draft.blueTeam, ...draft.redTeam]
    const readyCount = allPlayers.filter(p => p.isReady).length

    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold">Match Found!</h1>
            <p className="text-muted-foreground mt-2">
              Waiting for all players to ready up...
            </p>
          </div>

          <div className="bg-muted rounded-lg p-6 mb-6">
            <div className="text-center mb-4">
              <span className="text-4xl font-bold">{readyCount}</span>
              <span className="text-2xl text-muted-foreground"> / 10</span>
              <p className="text-sm text-muted-foreground mt-1">Players Ready</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Blue Team */}
              <div>
                <h3 className="text-blue-500 font-semibold mb-2 text-center">Blue Team</h3>
                <div className="space-y-2">
                  {draft.blueTeam.map(player => (
                    <PlayerReadyCard
                      key={player.odId}
                      player={player}
                      isCurrentUser={player.odId === user?.uid}
                    />
                  ))}
                </div>
              </div>

              {/* Red Team */}
              <div>
                <h3 className="text-red-500 font-semibold mb-2 text-center">Red Team</h3>
                <div className="space-y-2">
                  {draft.redTeam.map(player => (
                    <PlayerReadyCard
                      key={player.odId}
                      player={player}
                      isCurrentUser={player.odId === user?.uid}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {myPlayer && !myPlayer.isReady && (
            <Button size="lg" className="w-full" onClick={setReady}>
              Ready Up
            </Button>
          )}

          {myPlayer?.isReady && (
            <p className="text-center text-muted-foreground">
              Waiting for other players...
            </p>
          )}
        </div>
      </Layout>
    )
  }

  // Active draft (banning or picking)
  const currentAction = draft.actions[draft.currentPhase]
  const myTeam = getMyTeam()
  const isBanPhase = draft.status === 'banning'

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge variant={isBanPhase ? 'destructive' : 'default'}>
              {isBanPhase ? 'BAN PHASE' : 'PICK PHASE'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Phase {draft.currentPhase + 1} of {draft.actions.length}
            </span>
          </div>
          
          {/* Timer */}
          <div className={`flex items-center gap-2 ${timeRemaining <= 10 ? 'text-destructive animate-pulse' : ''}`}>
            <Clock className="h-5 w-5" />
            <span className="text-2xl font-bold font-mono">{timeRemaining}s</span>
          </div>

          <div className="text-sm">
            <span className={currentAction?.team === 'blue' ? 'text-blue-500 font-semibold' : 'text-red-500 font-semibold'}>
              {currentAction?.team === 'blue' ? 'Blue Team' : 'Red Team'}'s Turn
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Blue Team */}
        <div className="w-64 border-r bg-blue-500/5 p-4">
          <h2 className="text-blue-500 font-bold text-center mb-4">Blue Team</h2>
          <p className="text-xs text-center text-muted-foreground mb-4">
            Avg MMR: {Math.round(draft.blueTeamAvgMmr)}
          </p>
          <div className="space-y-2">
            {ROLE_ORDER.map(role => {
              const player = draft.blueTeam.find(p => p.role === role)
              if (!player) return null
              return (
                <DraftPlayerCard
                  key={player.odId}
                  player={player}
                  isCurrentUser={player.odId === user?.uid}
                  champions={champions}
                  isBanning={isBanPhase}
                />
              )
            })}
          </div>
          
          {/* Blue Bans */}
          <div className="mt-6">
            <h3 className="text-xs text-muted-foreground mb-2">BANS</h3>
            <div className="flex flex-wrap gap-1">
              {draft.actions
                .filter(a => a.type === 'ban' && a.team === 'blue' && a.championId)
                .map((action, i) => (
                  <BannedChampion
                    key={i}
                    championId={action.championId!}
                    champions={champions}
                  />
                ))}
            </div>
          </div>
        </div>

        {/* Champion Grid */}
        <div className="flex-1 flex flex-col">
          {/* Search */}
          <div className="p-4 border-b">
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search champions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Champions */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-8 gap-2">
              {availableChampions.map(champion => (
                <button
                  key={champion.id}
                  onClick={() => isMyTurn() && setSelectedChampion(champion)}
                  disabled={!isMyTurn()}
                  className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                    selectedChampion?.id === champion.id
                      ? 'border-primary ring-2 ring-primary/50'
                      : 'border-transparent hover:border-primary/50'
                  } ${!isMyTurn() ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <img
                    src={champion.image}
                    alt={champion.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5">
                    <p className="text-[10px] text-white truncate text-center">
                      {champion.name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Lock In Button */}
          {isMyTurn() && (
            <div className="p-4 border-t bg-card">
              <Button
                size="lg"
                className="w-full"
                disabled={!selectedChampion || isSubmitting}
                onClick={handleLockIn}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {isBanPhase ? 'Lock Ban' : 'Lock Pick'}
                {selectedChampion && ` - ${selectedChampion.name}`}
              </Button>
            </div>
          )}

          {!isMyTurn() && (
            <div className="p-4 border-t bg-card text-center text-muted-foreground">
              Waiting for {currentAction?.team === 'blue' ? 'Blue' : 'Red'} team to {currentAction?.type}...
            </div>
          )}
        </div>

        {/* Red Team */}
        <div className="w-64 border-l bg-red-500/5 p-4">
          <h2 className="text-red-500 font-bold text-center mb-4">Red Team</h2>
          <p className="text-xs text-center text-muted-foreground mb-4">
            Avg MMR: {Math.round(draft.redTeamAvgMmr)}
          </p>
          <div className="space-y-2">
            {ROLE_ORDER.map(role => {
              const player = draft.redTeam.find(p => p.role === role)
              if (!player) return null
              return (
                <DraftPlayerCard
                  key={player.odId}
                  player={player}
                  isCurrentUser={player.odId === user?.uid}
                  champions={champions}
                  isBanning={isBanPhase}
                />
              )
            })}
          </div>
          
          {/* Red Bans */}
          <div className="mt-6">
            <h3 className="text-xs text-muted-foreground mb-2">BANS</h3>
            <div className="flex flex-wrap gap-1">
              {draft.actions
                .filter(a => a.type === 'ban' && a.team === 'red' && a.championId)
                .map((action, i) => (
                  <BannedChampion
                    key={i}
                    championId={action.championId!}
                    champions={champions}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayerReadyCard({ player, isCurrentUser }: { player: DraftPlayer; isCurrentUser: boolean }) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg border ${
      isCurrentUser ? 'border-primary bg-primary/10' : 'border-border'
    }`}>
      <Avatar className="h-8 w-8">
        <AvatarImage src={player.photoURL} />
        <AvatarFallback>{player.displayName[0]}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{player.displayName}</p>
        <p className="text-xs text-muted-foreground capitalize">{player.role}</p>
      </div>
      {player.isReady ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Clock className="h-4 w-4 text-muted-foreground animate-pulse" />
      )}
    </div>
  )
}

function DraftPlayerCard({
  player,
  isCurrentUser,
  champions,
  isBanning,
}: {
  player: DraftPlayer
  isCurrentUser: boolean
  champions: Champion[]
  isBanning: boolean
}) {
  const champion = champions.find(c => c.id === player.championId)

  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg border ${
      isCurrentUser ? 'border-primary bg-primary/10' : 'border-border'
    }`}>
      {champion ? (
        <img src={champion.image} alt={champion.name} className="h-10 w-10 rounded" />
      ) : (
        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
          <span className="text-xs text-muted-foreground capitalize">{player.role[0]}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {champion?.name || player.displayName}
        </p>
        <p className="text-xs text-muted-foreground capitalize">
          {player.role} • {player.mmr} MMR
        </p>
      </div>
    </div>
  )
}

function BannedChampion({ championId, champions }: { championId: string; champions: Champion[] }) {
  const champion = champions.find(c => c.id === championId)
  if (!champion) return null

  return (
    <div className="relative w-8 h-8 rounded overflow-hidden opacity-50 grayscale">
      <img src={champion.image} alt={champion.name} className="w-full h-full object-cover" />
      <X className="absolute inset-0 m-auto h-4 w-4 text-red-500" />
    </div>
  )
}
