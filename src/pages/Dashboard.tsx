import { Link } from 'react-router-dom'
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

export default function Dashboard() {
  const { userProfile } = useAuth()

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            Welcome back, {userProfile?.displayName || 'Summoner'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your scrims and team activities
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Scrims</CardTitle>
              <CardDescription>Your scheduled matches</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                No upcoming scrims scheduled
              </p>
              <Button variant="outline" className="w-full">
                Schedule a Scrim
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Player Queue</CardTitle>
              <CardDescription>Players looking for matches</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Find a balanced match with other players
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/queue">Join Queue</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fearless Draft</CardTitle>
              <CardDescription>Start a draft session</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Practice competitive drafting with cumulative bans
              </p>
              <Button variant="outline" className="w-full">
                New Draft
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Riot Account Section */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Connected Riot Accounts</CardTitle>
              <CardDescription>
                Link your League of Legends accounts to display your rank
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userProfile?.riotAccounts && userProfile.riotAccounts.length > 0 ? (
                <div className="space-y-3">
                  {userProfile.riotAccounts.map((account) => (
                    <div
                      key={account.puuid}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {account.gameName}
                          <span className="text-muted-foreground">#{account.tagLine}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {account.region} •{' '}
                          {account.rank ? (
                            <>
                              <span className={getRankColor(account.rank.tier)}>
                                {account.rank.tier} {account.rank.division}
                              </span>
                              {account.rank.wins !== undefined && account.rank.losses !== undefined && (
                                <span className="ml-1">
                                  ({Math.round((account.rank.wins / (account.rank.wins + account.rank.losses)) * 100)}% WR)
                                </span>
                              )}
                            </>
                          ) : (
                            'Unranked'
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" asChild className="w-full mt-3">
                    <Link to="/profile">Manage Accounts</Link>
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    No Riot accounts connected yet
                  </p>
                  <Button variant="outline" asChild>
                    <Link to="/profile">Connect Riot Account</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  )
}
