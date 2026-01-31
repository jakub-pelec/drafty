import { useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { RiotAccount, RiotRegion } from '@/types'

interface StartVerificationParams {
  gameName: string
  tagLine: string
  region: RiotRegion
}

interface StartVerificationResult {
  pendingId: string
  gameName: string
  tagLine: string
  requiredIconId: number
  expiresAt: string
}

interface CompleteVerificationResult {
  success: boolean
  account: RiotAccount
}

export interface PendingVerification {
  pendingId: string
  gameName: string
  tagLine: string
  requiredIconId: number
  expiresAt: Date
}

export function useRiotAccount(userId: string | undefined) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(null)

  async function startVerification(params: StartVerificationParams): Promise<boolean> {
    if (!userId) {
      setError('You must be logged in to connect a Riot account')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      const startRiotVerification = httpsCallable<StartVerificationParams, StartVerificationResult>(
        functions,
        'startRiotVerification'
      )
      
      const result = await startRiotVerification(params)
      
      setPendingVerification({
        pendingId: result.data.pendingId,
        gameName: result.data.gameName,
        tagLine: result.data.tagLine,
        requiredIconId: result.data.requiredIconId,
        expiresAt: new Date(result.data.expiresAt),
      })
      
      return true
    } catch (err) {
      handleError(err)
      return false
    } finally {
      setLoading(false)
    }
  }

  async function completeVerification(): Promise<RiotAccount | null> {
    if (!userId || !pendingVerification) {
      setError('No pending verification found')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const completeRiotVerification = httpsCallable<{ pendingId: string }, CompleteVerificationResult>(
        functions,
        'completeRiotVerification'
      )
      
      const result = await completeRiotVerification({ pendingId: pendingVerification.pendingId })
      
      setPendingVerification(null)
      return result.data.account
    } catch (err) {
      handleError(err)
      return null
    } finally {
      setLoading(false)
    }
  }

  async function cancelVerification(): Promise<void> {
    if (!pendingVerification) return

    try {
      const cancelRiotVerification = httpsCallable<{ pendingId: string }, { success: boolean }>(
        functions,
        'cancelRiotVerification'
      )
      
      await cancelRiotVerification({ pendingId: pendingVerification.pendingId })
    } catch (err) {
      console.error('Error canceling verification:', err)
    } finally {
      setPendingVerification(null)
      setError(null)
    }
  }

  async function removeAccount(puuid: string): Promise<boolean> {
    if (!userId) {
      setError('You must be logged in to remove a Riot account')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      const removeRiotAccount = httpsCallable<{ puuid: string }, { success: boolean }>(
        functions,
        'removeRiotAccount'
      )
      
      await removeRiotAccount({ puuid })
      return true
    } catch (err) {
      handleError(err)
      return false
    } finally {
      setLoading(false)
    }
  }

  async function refreshRank(puuid: string): Promise<boolean> {
    if (!userId) {
      setError('You must be logged in')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      const refreshRiotAccountRank = httpsCallable<{ puuid: string }, { success: boolean }>(
        functions,
        'refreshRiotAccountRank'
      )
      
      await refreshRiotAccountRank({ puuid })
      return true
    } catch (err) {
      handleError(err)
      return false
    } finally {
      setLoading(false)
    }
  }

  function handleError(err: unknown) {
    let message = 'An error occurred'
    
    if (err && typeof err === 'object' && 'message' in err) {
      const errorMessage = (err as { message: string }).message
      
      // Extract the actual error message from Firebase function errors
      if (errorMessage.includes('not-found')) {
        message = 'Riot account not found. Please check your Riot ID and Tag.'
      } else if (errorMessage.includes('already-exists')) {
        message = 'This Riot account is already connected.'
      } else if (errorMessage.includes('failed-precondition')) {
        if (errorMessage.includes('Icon verification failed')) {
          // Extract the full message
          const match = errorMessage.match(/Icon verification failed\..+/)
          message = match ? match[0] : 'Icon verification failed. Please make sure you changed to the correct icon.'
        } else {
          message = 'Riot API is not configured. Please contact support.'
        }
      } else if (errorMessage.includes('deadline-exceeded')) {
        message = 'Verification has expired. Please start again.'
        setPendingVerification(null)
      } else if (errorMessage.includes('permission-denied')) {
        message = 'You do not have permission to perform this action.'
      } else {
        message = errorMessage
      }
    }
    
    setError(message)
  }

  function clearError() {
    setError(null)
  }

  return {
    startVerification,
    completeVerification,
    cancelVerification,
    removeAccount,
    refreshRank,
    pendingVerification,
    loading,
    error,
    clearError,
  }
}
