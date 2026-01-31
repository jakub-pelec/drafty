import { useState, useEffect, useCallback, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { functions, db } from '@/lib/firebase'
import type { DraftSession, Champion } from '@/types'

export function useDraft(draftId: string | null, userId: string | undefined) {
  const [draft, setDraft] = useState<DraftSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(30)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Listen to draft updates in real-time
  useEffect(() => {
    if (!draftId) {
      setLoading(false)
      return
    }

    const unsubscribe = onSnapshot(
      doc(db, 'drafts', draftId),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data() as DraftSession
          setDraft(data)
          setLoading(false)
          
          // Reset timer when phase changes
          if (data.phaseStartedAt) {
            const phaseStart = data.phaseStartedAt.toMillis?.() || Date.now()
            const elapsed = Math.floor((Date.now() - phaseStart) / 1000)
            const remaining = Math.max(0, data.phaseTimeLimit - elapsed)
            setTimeRemaining(remaining)
          }
        } else {
          setDraft(null)
          setLoading(false)
        }
      },
      (err) => {
        console.error('Draft listener error:', err)
        setError('Failed to load draft')
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [draftId])

  // Timer countdown
  useEffect(() => {
    if (!draft || !['banning', 'picking'].includes(draft.status)) {
      return
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Timer expired
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [draft?.status, draft?.currentPhase])

  const setReady = useCallback(async () => {
    if (!draftId) return

    setError(null)

    try {
      const setDraftReady = httpsCallable<
        { draftId: string },
        { success: boolean; allReady: boolean }
      >(functions, 'setDraftReady')

      await setDraftReady({ draftId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set ready'
      setError(message)
    }
  }, [draftId])

  const makeAction = useCallback(async (championId: string, championName: string) => {
    if (!draftId) return null

    setError(null)

    try {
      const makeDraftAction = httpsCallable<
        { draftId: string; championId: string; championName: string },
        { success: boolean; nextPhase: number | null; completed: boolean }
      >(functions, 'makeDraftAction')

      const result = await makeDraftAction({ draftId, championId, championName })
      return result.data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to make action'
      setError(message)
      return null
    }
  }, [draftId])

  const timeoutDraft = useCallback(async () => {
    if (!draftId) return

    try {
      const timeoutDraftAction = httpsCallable<
        { draftId: string },
        { success: boolean }
      >(functions, 'timeoutDraftAction')

      await timeoutDraftAction({ draftId })
    } catch (err) {
      console.error('Failed to timeout draft:', err)
    }
  }, [draftId])

  // Check if it's the current user's turn
  const isMyTurn = useCallback(() => {
    if (!draft || !userId) return false
    if (!['banning', 'picking'].includes(draft.status)) return false

    const currentAction = draft.actions[draft.currentPhase]
    if (!currentAction?.isActive) return false

    const myTeam = draft.blueTeam.some(p => p.odId === userId)
      ? 'blue'
      : draft.redTeam.some(p => p.odId === userId)
      ? 'red'
      : null

    return myTeam === currentAction.team
  }, [draft, userId])

  // Get current user's team
  const getMyTeam = useCallback(() => {
    if (!draft || !userId) return null
    if (draft.blueTeam.some(p => p.odId === userId)) return 'blue'
    if (draft.redTeam.some(p => p.odId === userId)) return 'red'
    return null
  }, [draft, userId])

  return {
    draft,
    loading,
    error,
    timeRemaining,
    setReady,
    makeAction,
    timeoutDraft,
    isMyTurn,
    getMyTeam,
  }
}

export function useChampions() {
  const [champions, setChampions] = useState<Champion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    const fetchChampions = async () => {
      try {
        const getChampions = httpsCallable<
          void,
          { success: boolean; champions: Champion[]; version: string }
        >(functions, 'getChampions')

        const result = await getChampions()
        setChampions(result.data.champions)
        setVersion(result.data.version)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch champions'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchChampions()
  }, [])

  return { champions, loading, error, version }
}
