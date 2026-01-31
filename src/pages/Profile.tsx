import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRiotAccount } from '@/hooks/useRiotAccount'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Loader2, Trash2, AlertCircle, RefreshCw, CheckCircle2, Clock } from 'lucide-react'
import { MatchHistory } from '@/components/MatchHistory'
import type { RiotRegion, RiotAccount } from '@/types'

const REGIONS: { value: RiotRegion; label: string }[] = [
  { value: 'EUW1', label: 'Europe West' },
  { value: 'EUN1', label: 'Europe Nordic & East' },
  { value: 'NA1', label: 'North America' },
  { value: 'KR', label: 'Korea' },
  { value: 'BR1', label: 'Brazil' },
  { value: 'JP1', label: 'Japan' },
  { value: 'LA1', label: 'Latin America North' },
  { value: 'LA2', label: 'Latin America South' },
  { value: 'OC1', label: 'Oceania' },
  { value: 'TR1', label: 'Turkey' },
  { value: 'RU', label: 'Russia' },
  { value: 'PH2', label: 'Philippines' },
  { value: 'SG2', label: 'Singapore' },
  { value: 'TH2', label: 'Thailand' },
  { value: 'TW2', label: 'Taiwan' },
  { value: 'VN2', label: 'Vietnam' },
]

function getRankColor(tier: string): string {
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
  return colors[tier] || 'text-foreground'
}

// Data Dragon URL for summoner icons
function getSummonerIconUrl(iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/14.1.1/img/profileicon/${iconId}.png`
}

export default function Profile() {
  const { user, userProfile, refreshUserProfile } = useAuth()
  const {
    startVerification,
    completeVerification,
    cancelVerification,
    removeAccount,
    refreshRank,
    pendingVerification,
    loading,
    error,
    clearError,
  } = useRiotAccount(user?.uid)
  
  const [riotId, setRiotId] = useState('')
  const [tagLine, setTagLine] = useState('')
  const [region, setRegion] = useState<RiotRegion>('EUW1')
  const [removingPuuid, setRemovingPuuid] = useState<string | null>(null)
  const [refreshingPuuid, setRefreshingPuuid] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<string>('')

  const initials = userProfile?.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  // Update countdown timer for pending verification
  useEffect(() => {
    if (!pendingVerification) {
      setTimeLeft('')
      return
    }

    const updateTimer = () => {
      const now = new Date()
      const diff = pendingVerification.expiresAt.getTime() - now.getTime()
      
      if (diff <= 0) {
        setTimeLeft('Expired')
        cancelVerification()
        return
      }
      
      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    
    return () => clearInterval(interval)
  }, [pendingVerification, cancelVerification])

  async function handleStartVerification(e: React.FormEvent) {
    e.preventDefault()
    clearError()
    
    await startVerification({
      gameName: riotId,
      tagLine: tagLine,
      region: region,
    })
  }

  async function handleCompleteVerification() {
    clearError()
    
    const result = await completeVerification()
    
    if (result) {
      setRiotId('')
      setTagLine('')
      await refreshUserProfile()
    }
  }

  async function handleCancelVerification() {
    await cancelVerification()
    clearError()
  }

  async function handleRemoveAccount(account: RiotAccount) {
    setRemovingPuuid(account.puuid)
    clearError()
    
    const success = await removeAccount(account.puuid)
    
    if (success) {
      await refreshUserProfile()
    }
    
    setRemovingPuuid(null)
  }

  async function handleRefreshRank(account: RiotAccount) {
    setRefreshingPuuid(account.puuid)
    clearError()
    
    const success = await refreshRank(account.puuid)
    
    if (success) {
      await refreshUserProfile()
    }
    
    setRefreshingPuuid(null)
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-8">Profile Settings</h1>

        {/* Profile Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={userProfile?.photoURL} alt={userProfile?.displayName} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-medium">{userProfile?.displayName}</p>
                <p className="text-sm text-muted-foreground">{userProfile?.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connected Riot Accounts */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Riot Accounts</CardTitle>
            <CardDescription>
              Connect your League of Legends accounts to show your rank and stats
            </CardDescription>
          </CardHeader>
          <CardContent>
            {userProfile?.riotAccounts && userProfile.riotAccounts.length > 0 && (
              <div className="space-y-3 mb-6">
                {userProfile.riotAccounts.map((account) => (
                  <div
                    key={account.puuid}
                    className="p-4 border rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {account.gameName}
                            <span className="text-muted-foreground">#{account.tagLine}</span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {REGIONS.find(r => r.value === account.region)?.label || account.region}
                            {' • '}
                            {account.rank ? (
                              <>
                                <span className={getRankColor(account.rank.tier)}>
                                  {account.rank.tier} {account.rank.division} ({account.rank.lp} LP)
                                </span>
                                {account.rank.wins !== undefined && account.rank.losses !== undefined && (
                                  <>
                                    {' • '}
                                    <span>
                                      {account.rank.wins}W {account.rank.losses}L
                                      {' '}
                                      ({Math.round((account.rank.wins / (account.rank.wins + account.rank.losses)) * 100)}%)
                                    </span>
                                  </>
                                )}
                              </>
                            ) : (
                              'Unranked'
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRefreshRank(account)}
                          disabled={refreshingPuuid === account.puuid}
                          title="Refresh rank"
                        >
                          {refreshingPuuid === account.puuid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveAccount(account)}
                          disabled={removingPuuid === account.puuid}
                          title="Remove account"
                        >
                          {removingPuuid === account.puuid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <MatchHistory account={account} />
                  </div>
                ))}
              </div>
            )}

            {(!userProfile?.riotAccounts || userProfile.riotAccounts.length === 0) && !pendingVerification && (
              <p className="text-sm text-muted-foreground mb-6">
                No Riot accounts connected yet
              </p>
            )}

            <Separator className="my-6" />

            {/* Error display */}
            {error && (
              <div className="flex items-start gap-2 bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Pending Verification UI */}
            {pendingVerification ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Verify your account</h4>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Expires in {timeLeft}</span>
                  </div>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-6 text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    To verify ownership of <strong>{pendingVerification.gameName}#{pendingVerification.tagLine}</strong>,
                    please change your summoner icon to:
                  </p>
                  
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={getSummonerIconUrl(pendingVerification.requiredIconId)}
                      alt={`Summoner Icon ${pendingVerification.requiredIconId}`}
                      className="w-24 h-24 rounded-lg border-2 border-primary"
                    />
                    <span className="text-sm font-medium">Icon #{pendingVerification.requiredIconId}</span>
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>1. Open the League of Legends client</p>
                    <p>2. Click your profile icon in the top right</p>
                    <p>3. Select the icon shown above</p>
                    <p>4. Click "Verify" below once done</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleCancelVerification}
                    disabled={loading}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCompleteVerification}
                    disabled={loading}
                    className="flex-1"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              /* Connect new account form */
              <form onSubmit={handleStartVerification} className="space-y-4">
                <h4 className="font-medium">Connect a new account</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="riotId">Riot ID</Label>
                    <Input
                      id="riotId"
                      placeholder="GameName"
                      value={riotId}
                      onChange={(e) => setRiotId(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tagLine">Tag</Label>
                    <Input
                      id="tagLine"
                      placeholder="EUW"
                      value={tagLine}
                      onChange={(e) => setTagLine(e.target.value)}
                      maxLength={5}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">Region</Label>
                    <Select
                      value={region}
                      onValueChange={(value) => setRegion(value as RiotRegion)}
                      disabled={loading}
                    >
                      <SelectTrigger id="region">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        {REGIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Button type="submit" disabled={!riotId || !tagLine || loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Looking up account...
                    </>
                  ) : (
                    'Start Verification'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" disabled>
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
