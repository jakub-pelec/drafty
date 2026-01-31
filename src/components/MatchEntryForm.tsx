import { useState } from 'react'
import { useMatchSubmit } from '@/hooks/useMMR'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Trophy, AlertCircle } from 'lucide-react'
import { MMRChange } from '@/components/MMRBadge'
import type { PlayerRole } from '@/types'

const ROLES: { value: PlayerRole; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'jungle', label: 'Jungle' },
  { value: 'mid', label: 'Mid' },
  { value: 'adc', label: 'ADC' },
  { value: 'support', label: 'Support' },
]

interface PlayerInput {
  odId: string
  oduid: string
  displayName: string
  role: PlayerRole
  stats: {
    champion: string
    kills: number
    deaths: number
    assists: number
    cs: number
    damage: number
    visionScore: number
    objectiveScore: number
  }
}

const emptyPlayerStats = (): PlayerInput['stats'] => ({
  champion: '',
  kills: 0,
  deaths: 0,
  assists: 0,
  cs: 0,
  damage: 0,
  visionScore: 0,
  objectiveScore: 0,
})

const emptyPlayer = (role: PlayerRole): PlayerInput => ({
  odId: '',
  oduid: '',
  displayName: '',
  role,
  stats: emptyPlayerStats(),
})

interface MatchEntryFormProps {
  onSuccess?: () => void
}

export function MatchEntryForm({ onSuccess }: MatchEntryFormProps) {
  const { submitMatch, loading, error } = useMatchSubmit()
  const [winner, setWinner] = useState<'blue' | 'red' | ''>('')
  const [blueTeam, setBlueTeam] = useState<PlayerInput[]>(
    ROLES.map(r => emptyPlayer(r.value))
  )
  const [redTeam, setRedTeam] = useState<PlayerInput[]>(
    ROLES.map(r => emptyPlayer(r.value))
  )
  const [showResults, setShowResults] = useState(false)
  const [results, setResults] = useState<{
    matchId: string
    mmrChanges: Array<{ odId: string; change: number; newMmr: number; rank: string }>
  } | null>(null)

  function updatePlayer(
    team: 'blue' | 'red',
    index: number,
    field: keyof PlayerInput | keyof PlayerInput['stats'],
    value: string | number
  ) {
    const setter = team === 'blue' ? setBlueTeam : setRedTeam
    setter(prev => {
      const newTeam = [...prev]
      if (field in newTeam[index].stats) {
        newTeam[index] = {
          ...newTeam[index],
          stats: {
            ...newTeam[index].stats,
            [field]: value,
          },
        }
      } else {
        newTeam[index] = {
          ...newTeam[index],
          [field]: value,
        }
      }
      return newTeam
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!winner) {
      return
    }

    // Validate all players have names
    const allPlayers = [...blueTeam, ...redTeam]
    const missingNames = allPlayers.filter(p => !p.displayName.trim())
    if (missingNames.length > 0) {
      return
    }

    // Generate IDs for players (in a real app, these would be selected from existing users)
    const blueTeamWithIds = blueTeam.map((p, i) => ({
      ...p,
      odId: p.odId || `blue-${i}-${Date.now()}`,
      oduid: p.oduid || `blue-${i}-${Date.now()}`,
    }))

    const redTeamWithIds = redTeam.map((p, i) => ({
      ...p,
      odId: p.odId || `red-${i}-${Date.now()}`,
      oduid: p.oduid || `red-${i}-${Date.now()}`,
    }))

    const result = await submitMatch({
      winner,
      blueTeam: blueTeamWithIds,
      redTeam: redTeamWithIds,
    })

    if (result) {
      setResults(result)
      setShowResults(true)
      onSuccess?.()
    }
  }

  function PlayerStatsInput({
    team,
    index,
    player,
  }: {
    team: 'blue' | 'red'
    index: number
    player: PlayerInput
  }) {
    const teamColor = team === 'blue' ? 'border-blue-500/30' : 'border-red-500/30'
    const teamBg = team === 'blue' ? 'bg-blue-500/5' : 'bg-red-500/5'

    return (
      <div className={`p-4 rounded-lg border ${teamColor} ${teamBg} space-y-3`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-muted-foreground">
            {ROLES[index].label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Player Name</Label>
            <Input
              placeholder="Name"
              value={player.displayName}
              onChange={e => updatePlayer(team, index, 'displayName', e.target.value)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Champion</Label>
            <Input
              placeholder="Champion"
              value={player.stats.champion}
              onChange={e => updatePlayer(team, index, 'champion', e.target.value)}
              className="h-8"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Kills</Label>
            <Input
              type="number"
              min={0}
              value={player.stats.kills}
              onChange={e => updatePlayer(team, index, 'kills', parseInt(e.target.value) || 0)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Deaths</Label>
            <Input
              type="number"
              min={0}
              value={player.stats.deaths}
              onChange={e => updatePlayer(team, index, 'deaths', parseInt(e.target.value) || 0)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Assists</Label>
            <Input
              type="number"
              min={0}
              value={player.stats.assists}
              onChange={e => updatePlayer(team, index, 'assists', parseInt(e.target.value) || 0)}
              className="h-8"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">CS</Label>
            <Input
              type="number"
              min={0}
              value={player.stats.cs}
              onChange={e => updatePlayer(team, index, 'cs', parseInt(e.target.value) || 0)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Damage</Label>
            <Input
              type="number"
              min={0}
              value={player.stats.damage}
              onChange={e => updatePlayer(team, index, 'damage', parseInt(e.target.value) || 0)}
              className="h-8"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Vision Score</Label>
            <Input
              type="number"
              min={0}
              value={player.stats.visionScore}
              onChange={e => updatePlayer(team, index, 'visionScore', parseInt(e.target.value) || 0)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Objective Score</Label>
            <Input
              type="number"
              min={0}
              value={player.stats.objectiveScore}
              onChange={e => updatePlayer(team, index, 'objectiveScore', parseInt(e.target.value) || 0)}
              className="h-8"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive text-sm p-3 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Winner Selection */}
        <div className="space-y-2">
          <Label>Winner</Label>
          <Select value={winner} onValueChange={(v) => setWinner(v as 'blue' | 'red')}>
            <SelectTrigger>
              <SelectValue placeholder="Select winning team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blue">
                <span className="text-blue-500 font-medium">Blue Team</span>
              </SelectItem>
              <SelectItem value="red">
                <span className="text-red-500 font-medium">Red Team</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Teams */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Blue Team */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-blue-500 flex items-center gap-2">
                Blue Team
                {winner === 'blue' && <Trophy className="h-4 w-4" />}
              </CardTitle>
              <CardDescription>Enter player stats for blue side</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {blueTeam.map((player, index) => (
                <PlayerStatsInput
                  key={index}
                  team="blue"
                  index={index}
                  player={player}
                />
              ))}
            </CardContent>
          </Card>

          {/* Red Team */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-red-500 flex items-center gap-2">
                Red Team
                {winner === 'red' && <Trophy className="h-4 w-4" />}
              </CardTitle>
              <CardDescription>Enter player stats for red side</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {redTeam.map((player, index) => (
                <PlayerStatsInput
                  key={index}
                  team="red"
                  index={index}
                  player={player}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <Button type="submit" disabled={loading || !winner} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Match Result'
          )}
        </Button>
      </form>

      {/* Results Dialog */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Match Submitted Successfully</DialogTitle>
            <DialogDescription>
              MMR has been updated for all players
            </DialogDescription>
          </DialogHeader>

          {results && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {results.mmrChanges.map((change) => {
                  const player = [...blueTeam, ...redTeam].find(p => 
                    p.odId === change.odId || p.displayName === change.odId
                  )
                  return (
                    <div
                      key={change.odId}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <p className="font-medium">{player?.displayName || change.odId}</p>
                        <p className="text-sm text-muted-foreground">
                          {change.rank} • {change.newMmr} MMR
                        </p>
                      </div>
                      <MMRChange change={change.change} />
                    </div>
                  )
                })}
              </div>

              <Button onClick={() => setShowResults(false)} className="w-full">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
