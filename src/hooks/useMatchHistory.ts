import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { MatchInfo } from '@/types'

interface GetMatchesResult {
  matches: MatchInfo[]
}

export function useMatchHistory() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<Record<string, MatchInfo[]>>({})

  async function fetchMatches(puuid: string, region: string, count = 5): Promise<MatchInfo[]> {
    setLoading(true)
    setError(null)

    try {
      const getRecentMatches = httpsCallable<
        { puuid: string; region: string; count: number },
        GetMatchesResult
      >(functions, 'getRecentMatches')

      const result = await getRecentMatches({ puuid, region, count })
      
      setMatches(prev => ({
        ...prev,
        [puuid]: result.data.matches,
      }))
      
      return result.data.matches
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch match history'
      setError(message)
      return []
    } finally {
      setLoading(false)
    }
  }

  function getMatchesForAccount(puuid: string): MatchInfo[] {
    return matches[puuid] || []
  }

  function clearError() {
    setError(null)
  }

  return {
    fetchMatches,
    getMatchesForAccount,
    loading,
    error,
    clearError,
  }
}
