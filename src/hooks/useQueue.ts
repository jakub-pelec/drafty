import { useState, useEffect, useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { functions, db } from '@/lib/firebase'
import type { PlayerRole, QueueEntry, DraftSession } from '@/types'

interface QueueStatus {
  inQueue: boolean
  queueEntry: QueueEntry | null
  playersInQueue: number
  roleCount: Record<PlayerRole, number>
}

export function useQueue(userId: string | undefined) {
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matchFound, setMatchFound] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)

  // Listen to queue status in real-time
  useEffect(() => {
    if (!userId) return

    const unsubscribe = onSnapshot(
      doc(db, 'queue', userId),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          // User is in queue, fetch full status
          fetchQueueStatus()
        } else {
          setStatus(prev => prev ? { ...prev, inQueue: false, queueEntry: null } : null)
        }
      },
      (err) => {
        console.error('Queue listener error:', err)
      }
    )

    return () => unsubscribe()
  }, [userId])

  const fetchQueueStatus = useCallback(async () => {
    if (!userId) return

    try {
      const getQueueStatus = httpsCallable<void, { success: boolean } & QueueStatus>(
        functions,
        'getQueueStatus'
      )

      const result = await getQueueStatus()
      setStatus({
        inQueue: result.data.inQueue,
        queueEntry: result.data.queueEntry,
        playersInQueue: result.data.playersInQueue,
        roleCount: result.data.roleCount,
      })
    } catch (err) {
      console.error('Error fetching queue status:', err)
    }
  }, [userId])

  const joinQueue = useCallback(async (role: PlayerRole, region: string) => {
    if (!userId) return null

    setLoading(true)
    setError(null)

    try {
      const joinQueueFn = httpsCallable<
        { role: PlayerRole; region: string },
        { success: boolean; inQueue: boolean; matchFound: boolean; draftId?: string }
      >(functions, 'joinQueue')

      const result = await joinQueueFn({ role, region })
      
      if (result.data.matchFound && result.data.draftId) {
        setMatchFound(true)
        setDraftId(result.data.draftId)
      }

      await fetchQueueStatus()
      return result.data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join queue'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [userId, fetchQueueStatus])

  const leaveQueue = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      const leaveQueueFn = httpsCallable<void, { success: boolean }>(
        functions,
        'leaveQueue'
      )

      await leaveQueueFn()
      setStatus(prev => prev ? { ...prev, inQueue: false, queueEntry: null } : null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to leave queue'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Poll for match found
  useEffect(() => {
    if (!userId || !status?.inQueue) return

    const checkForDraft = async () => {
      try {
        const getActiveDraft = httpsCallable<void, { success: boolean; draft: DraftSession | null }>(
          functions,
          'getActiveDraft'
        )

        const result = await getActiveDraft()
        if (result.data.draft) {
          setMatchFound(true)
          setDraftId(result.data.draft.id)
        }
      } catch (err) {
        console.error('Error checking for draft:', err)
      }
    }

    const interval = setInterval(checkForDraft, 3000)
    return () => clearInterval(interval)
  }, [userId, status?.inQueue])

  return {
    status,
    loading,
    error,
    matchFound,
    draftId,
    joinQueue,
    leaveQueue,
    fetchQueueStatus,
  }
}
