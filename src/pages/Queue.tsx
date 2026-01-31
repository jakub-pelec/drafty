import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useQueue } from '@/hooks/useQueue'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Users, Clock, Shield, Swords, Crosshair, Heart, Target } from 'lucide-react'
import type { PlayerRole, RiotRegion } from '@/types'

const ROLES: { value: PlayerRole; label: string; icon: React.ReactNode }[] = [
  { value: 'top', label: 'Top', icon: <Shield className="h-5 w-5" /> },
  { value: 'jungle', label: 'Jungle', icon: <Crosshair className="h-5 w-5" /> },
  { value: 'mid', label: 'Mid', icon: <Swords className="h-5 w-5" /> },
  { value: 'adc', label: 'ADC', icon: <Target className="h-5 w-5" /> },
  { value: 'support', label: 'Support', icon: <Heart className="h-5 w-5" /> },
]

const REGIONS: { value: RiotRegion; label: string }[] = [
  { value: 'EUW1', label: 'EU West' },
  { value: 'EUN1', label: 'EU Nordic & East' },
  { value: 'NA1', label: 'North America' },
  { value: 'KR', label: 'Korea' },
  { value: 'BR1', label: 'Brazil' },
  { value: 'JP1', label: 'Japan' },
  { value: 'OC1', label: 'Oceania' },
  { value: 'RU', label: 'Russia' },
  { value: 'TR1', label: 'Turkey' },
]

export default function Queue() {
  const { user, userProfile } = useAuth()
  const navigate = useNavigate()
  const { status, loading, error, matchFound, draftId, joinQueue, leaveQueue } = useQueue(user?.uid)
  
  const [selectedRole, setSelectedRole] = useState<PlayerRole | ''>('')
  const [selectedRegion, setSelectedRegion] = useState<RiotRegion | ''>('')
  const [queueTime, setQueueTime] = useState(0)

  // Redirect to draft when match is found
  useEffect(() => {
    if (matchFound && draftId) {
      navigate(`/draft/${draftId}`)
    }
  }, [matchFound, draftId, navigate])

  // Queue timer
  useEffect(() => {
    if (!status?.inQueue) {
      setQueueTime(0)
      return
    }

    const interval = setInterval(() => {
      setQueueTime(prev => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [status?.inQueue])

  // Set default region from user's first Riot account
  useEffect(() => {
    if (userProfile?.riotAccounts?.[0]?.region && !selectedRegion) {
      setSelectedRegion(userProfile.riotAccounts[0].region)
    }
  }, [userProfile, selectedRegion])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleJoinQueue = async () => {
    if (!selectedRole || !selectedRegion) return
    await joinQueue(selectedRole, selectedRegion)
  }

  const handleLeaveQueue = async () => {
    await leaveQueue()
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Find a Match</h1>
          <p className="text-muted-foreground mt-1">
            Queue up to find 9 other players for a balanced scrim
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-6">
            {error}
          </div>
        )}

        {/* Queue Status Card */}
        {status?.inQueue ? (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Searching for Match...
              </CardTitle>
              <CardDescription>
                You are in queue as {ROLES.find(r => r.value === status.queueEntry?.role)?.label}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold">{formatTime(queueTime)}</p>
                    <p className="text-sm text-muted-foreground">Queue Time</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold">{status.playersInQueue}</p>
                    <p className="text-sm text-muted-foreground">In Queue</p>
                  </div>
                </div>
                <Button variant="destructive" onClick={handleLeaveQueue} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Leave Queue'}
                </Button>
              </div>

              {/* Role counts */}
              <div className="grid grid-cols-5 gap-2">
                {ROLES.map(role => (
                  <div
                    key={role.value}
                    className={`text-center p-3 rounded-lg border ${
                      status.queueEntry?.role === role.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex justify-center mb-1">{role.icon}</div>
                    <p className="text-xs text-muted-foreground">{role.label}</p>
                    <p className="font-semibold">{status.roleCount[role.value]}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Role Selection */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Select Your Role</CardTitle>
                <CardDescription>
                  Choose the position you want to play
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-3">
                  {ROLES.map(role => (
                    <button
                      key={role.value}
                      onClick={() => setSelectedRole(role.value)}
                      className={`flex flex-col items-center p-4 rounded-lg border-2 transition-all ${
                        selectedRole === role.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className={`mb-2 ${selectedRole === role.value ? 'text-primary' : ''}`}>
                        {role.icon}
                      </div>
                      <span className="text-sm font-medium">{role.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Region Selection */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Select Region</CardTitle>
                <CardDescription>
                  Choose your game server region
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedRegion}
                  onValueChange={(v) => setSelectedRegion(v as RiotRegion)}
                >
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map(region => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Join Queue Button */}
            <Button
              size="lg"
              className="w-full"
              onClick={handleJoinQueue}
              disabled={loading || !selectedRole || !selectedRegion}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Joining Queue...
                </>
              ) : (
                <>
                  <Users className="mr-2 h-4 w-4" />
                  Find Match
                </>
              )}
            </Button>
          </>
        )}

        {/* Queue Info */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>How it Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">1</Badge>
              <div>
                <p className="font-medium">Select Your Role</p>
                <p className="text-sm text-muted-foreground">
                  Choose the position you want to play. You'll be matched with others filling different roles.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">2</Badge>
              <div>
                <p className="font-medium">Wait for Match</p>
                <p className="text-sm text-muted-foreground">
                  The system will find 10 players with balanced MMR and assign teams.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">3</Badge>
              <div>
                <p className="font-medium">Draft Phase</p>
                <p className="text-sm text-muted-foreground">
                  Once matched, you'll enter the champion select screen to ban and pick champions.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">4</Badge>
              <div>
                <p className="font-medium">Play the Game</p>
                <p className="text-sm text-muted-foreground">
                  After the draft, you'll receive lobby details to create the custom game in the League client.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
