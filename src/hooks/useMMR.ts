import { useState, useEffect, useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { PlayerMMR, LeaderboardEntry } from '@/types'
import { getRankFromMMR } from '@/lib/mmr'

interface MMRData extends Omit<PlayerMMR, 'history'> {
  rank: string
  winRate: number
}

export function useMMR(userId: string | undefined) {
  const [mmr, setMmr] = useState<MMRData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMMR = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      const getPlayerMMR = httpsCallable<{ odId?: string }, { success: boolean; mmr: MMRData | null }>(
        functions,
        'getPlayerMMR'
      )

      const result = await getPlayerMMR({ odId: userId })
      setMmr(result.data.mmr)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch MMR')
    } finally {
      setLoading(false)
    }
  }, [userId])

  const initializeMMR = useCallback(async () => {
    if (!userId) return null

    setLoading(true)
    setError(null)

    try {
      const initializePlayerMMR = httpsCallable<void, { success: boolean; mmr: MMRData }>(
        functions,
        'initializePlayerMMR'
      )

      const result = await initializePlayerMMR()
      const mmrData = {
        ...result.data.mmr,
        rank: getRankFromMMR(result.data.mmr.mmr),
        winRate: 0,
      }
      setMmr(mmrData)
      return mmrData
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize MMR')
      return null
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchMMR()
  }, [fetchMMR])

  return {
    mmr,
    loading,
    error,
    fetchMMR,
    initializeMMR,
  }
}

export function useLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(async (limit = 50) => {
    setLoading(true)
    setError(null)

    try {
      const getLeaderboard = httpsCallable<{ limit: number }, { success: boolean; leaderboard: LeaderboardEntry[] }>(
        functions,
        'getLeaderboard'
      )

      const result = await getLeaderboard({ limit })
      setLeaderboard(result.data.leaderboard)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  return {
    leaderboard,
    loading,
    error,
    fetchLeaderboard,
  }
}

interface SubmitMatchParams {
  winner: 'blue' | 'red'
  blueTeam: Array<{
    odId: string
    oduid: string
    displayName: string
    role: string
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
  }>
  redTeam: Array<{
    odId: string
    oduid: string
    displayName: string
    role: string
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
  }>
}

interface MMRChangeResult {
  odId: string
  change: number
  performanceScore: number
  newMmr: number
  rank: string
}

export function useMatchSubmit() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitMatch = useCallback(async (params: SubmitMatchParams) => {
    setLoading(true)
    setError(null)

    try {
      const submitMatchResult = httpsCallable<
        SubmitMatchParams,
        { success: boolean; matchId: string; mmrChanges: MMRChangeResult[] }
      >(functions, 'submitMatchResult')

      const result = await submitMatchResult(params)
      return result.data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit match'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    submitMatch,
    loading,
    error,
  }
}
