import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import {
  getInitialMMR,
  getRankFromMMR,
  calculateMMRChange,
  applyMMRChange,
  MMR_CONFIG,
  type PlayerStats,
  type MatchContext,
} from './mmr'

initializeApp()

const db = getFirestore()

// Riot API base URLs
const RIOT_ACCOUNT_API = 'https://europe.api.riotgames.com'

interface RiotAccountResponse {
  puuid: string
  gameName: string
  tagLine: string
}

interface SummonerResponse {
  id: string
  accountId: string
  puuid: string
  profileIconId: number
  revisionDate: number
  summonerLevel: number
}

interface RiotRankEntry {
  queueType: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}

// Common free summoner icons that everyone has access to
const VERIFICATION_ICONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]

interface StartVerificationData {
  gameName: string
  tagLine: string
  region: string
}

interface CompleteVerificationData {
  pendingId: string
}

interface PendingVerification {
  userId: string
  puuid: string
  gameName: string
  tagLine: string
  region: string
  requiredIconId: number
  createdAt: FirebaseFirestore.FieldValue
  expiresAt: Date
}

/**
 * Step 1: Start the verification process
 * Looks up the Riot account and creates a pending verification with a required icon
 */
export const startRiotVerification = onCall<StartVerificationData>(
  { secrets: ['RIOT_API_KEY'] },
  async (request) => {
    console.log('startRiotVerification called')
    
    if (!request.auth) {
      console.log('No auth')
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { gameName, tagLine, region = 'EUW1' } = request.data
    const userId = request.auth.uid
    
    console.log('Request data:', { gameName, tagLine, region, userId })

    if (!gameName || !tagLine) {
      throw new HttpsError('invalid-argument', 'gameName and tagLine are required')
    }

    const apiKey = process.env.RIOT_API_KEY
    console.log('API Key present:', !!apiKey)
    
    if (!apiKey) {
      console.error('RIOT_API_KEY not found in environment')
      throw new HttpsError('failed-precondition', 'Riot API key not configured. Set RIOT_API_KEY in functions/.secret.local')
    }

    try {
      // Look up the account
      const riotUrl = `${RIOT_ACCOUNT_API}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
      console.log('Fetching Riot API:', riotUrl)
      
      const accountResponse = await fetch(riotUrl, { 
        headers: { 'X-Riot-Token': apiKey } 
      })

      console.log('Riot API response status:', accountResponse.status)

      if (!accountResponse.ok) {
        const errorText = await accountResponse.text()
        console.error('Riot API error:', accountResponse.status, errorText)
        
        if (accountResponse.status === 404) {
          throw new HttpsError('not-found', 'Riot account not found. Please check your Riot ID and Tag.')
        }
        if (accountResponse.status === 401 || accountResponse.status === 403) {
          throw new HttpsError('failed-precondition', 'Invalid Riot API key')
        }
        throw new HttpsError('internal', `Failed to look up Riot account: ${accountResponse.status}`)
      }

      const accountData: RiotAccountResponse = await accountResponse.json()

      // Check if account is already connected to this user
      const userDoc = await db.collection('users').doc(userId).get()
      if (userDoc.exists) {
        const userData = userDoc.data()
        const existingAccounts = userData?.riotAccounts || []
        if (existingAccounts.some((acc: { puuid: string }) => acc.puuid === accountData.puuid)) {
          throw new HttpsError('already-exists', 'This Riot account is already connected to your profile')
        }
      }

      // Check if account is connected to another user
      // Note: array-contains-any doesn't work well for nested objects, so we do a manual check
      const allUsers = await db.collection('users').get()
      for (const doc of allUsers.docs) {
        if (doc.id === userId) continue
        const accounts = doc.data().riotAccounts || []
        if (accounts.some((acc: { puuid: string }) => acc.puuid === accountData.puuid)) {
          throw new HttpsError('already-exists', 'This Riot account is already connected to another user')
        }
      }

      // Delete any existing pending verifications for this user
      const existingPending = await db.collection('pendingVerifications')
        .where('userId', '==', userId)
        .get()
      
      const batch = db.batch()
      existingPending.docs.forEach(doc => batch.delete(doc.ref))
      await batch.commit()

      // Generate a random icon requirement
      const requiredIconId = VERIFICATION_ICONS[Math.floor(Math.random() * VERIFICATION_ICONS.length)]

      // Create pending verification (expires in 10 minutes)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
      
      const pendingRef = await db.collection('pendingVerifications').add({
        userId,
        puuid: accountData.puuid,
        gameName: accountData.gameName,
        tagLine: accountData.tagLine,
        region,
        requiredIconId,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      })

      return {
        pendingId: pendingRef.id,
        gameName: accountData.gameName,
        tagLine: accountData.tagLine,
        requiredIconId,
        expiresAt: expiresAt.toISOString(),
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error starting verification:', error)
      throw new HttpsError('internal', 'Failed to start verification')
    }
  }
)

/**
 * Step 2: Complete the verification
 * Checks if the user has set the correct summoner icon
 */
export const completeRiotVerification = onCall<CompleteVerificationData>(
  { secrets: ['RIOT_API_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { pendingId } = request.data
    const userId = request.auth.uid

    if (!pendingId) {
      throw new HttpsError('invalid-argument', 'pendingId is required')
    }

    const apiKey = process.env.RIOT_API_KEY
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Riot API key not configured')
    }

    try {
      // Get the pending verification
      const pendingDoc = await db.collection('pendingVerifications').doc(pendingId).get()
      
      if (!pendingDoc.exists) {
        throw new HttpsError('not-found', 'Verification request not found or expired')
      }

      const pending = pendingDoc.data() as PendingVerification
      
      if (pending.userId !== userId) {
        throw new HttpsError('permission-denied', 'This verification does not belong to you')
      }

      if (new Date() > new Date(pending.expiresAt)) {
        await pendingDoc.ref.delete()
        throw new HttpsError('deadline-exceeded', 'Verification has expired. Please start again.')
      }

      // Get current summoner icon from Riot API
      const regionBase = getRegionalEndpoint(pending.region)
      const summonerResponse = await fetch(
        `${regionBase}/lol/summoner/v4/summoners/by-puuid/${pending.puuid}`,
        { headers: { 'X-Riot-Token': apiKey } }
      )

      if (!summonerResponse.ok) {
        throw new HttpsError('internal', 'Failed to fetch summoner data')
      }

      const summonerData: SummonerResponse = await summonerResponse.json()

      // Check if icon matches
      if (summonerData.profileIconId !== pending.requiredIconId) {
        throw new HttpsError(
          'failed-precondition',
          `Icon verification failed. Your current icon is ${summonerData.profileIconId}, but we need icon ${pending.requiredIconId}. Please change your summoner icon and try again.`
        )
      }

      // Icon matches! Get rank info using PUUID endpoint
      console.log('Summoner data:', JSON.stringify(summonerData))
      
      let rankInfo = null
      
      // Use the by-puuid endpoint for ranked data (newer API that doesn't require summoner ID)
      const rankedUrl = `${regionBase}/lol/league/v4/entries/by-puuid/${pending.puuid}`
      console.log('Fetching ranked data from:', rankedUrl)
      
      const rankedResponse = await fetch(rankedUrl, { 
        headers: { 'X-Riot-Token': apiKey } 
      })

      console.log('Ranked response status:', rankedResponse.status)

      if (rankedResponse.ok) {
        const rankedData: RiotRankEntry[] = await rankedResponse.json()
        console.log('Ranked data:', JSON.stringify(rankedData))
        
        const soloQueue = rankedData.find(entry => entry.queueType === 'RANKED_SOLO_5x5')
        
        if (soloQueue) {
          rankInfo = {
            tier: soloQueue.tier,
            division: soloQueue.rank,
            lp: soloQueue.leaguePoints,
            wins: soloQueue.wins,
            losses: soloQueue.losses,
          }
          console.log('Rank info:', JSON.stringify(rankInfo))
        } else {
          console.log('No solo queue entry found in:', rankedData.map(e => e.queueType))
        }
      } else {
        const errorText = await rankedResponse.text()
        console.error('Failed to fetch ranked data:', rankedResponse.status, errorText)
      }

      // Build account object - use Date instead of serverTimestamp (can't use serverTimestamp in arrays)
      const now = new Date()
      const riotAccount: Record<string, unknown> = {
        puuid: pending.puuid,
        gameName: pending.gameName,
        tagLine: pending.tagLine,
        region: pending.region,
        profileIconId: summonerData.profileIconId,
        lastUpdated: now,
        verifiedAt: now,
      }
      
      // Only add optional fields if they exist
      if (summonerData.id) {
        riotAccount.summonerId = summonerData.id
      }
      if (summonerData.summonerLevel) {
        riotAccount.summonerLevel = summonerData.summonerLevel
      }
      if (rankInfo) {
        riotAccount.rank = rankInfo
      }

      // Add to user's profile
      const userRef = db.collection('users').doc(userId)
      await userRef.update({
        riotAccounts: FieldValue.arrayUnion(riotAccount),
        updatedAt: FieldValue.serverTimestamp(),
      })

      // Delete the pending verification
      await pendingDoc.ref.delete()

      return {
        success: true,
        account: {
          puuid: riotAccount.puuid,
          gameName: riotAccount.gameName,
          tagLine: riotAccount.tagLine,
          region: riotAccount.region,
          rank: rankInfo,
        },
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error completing verification:', error)
      throw new HttpsError('internal', 'Failed to complete verification')
    }
  }
)

/**
 * Cancel a pending verification
 */
export const cancelRiotVerification = onCall<{ pendingId: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { pendingId } = request.data
    const userId = request.auth.uid

    const pendingDoc = await db.collection('pendingVerifications').doc(pendingId).get()
    
    if (pendingDoc.exists && pendingDoc.data()?.userId === userId) {
      await pendingDoc.ref.delete()
    }

    return { success: true }
  }
)

/**
 * Remove a connected Riot account
 */
export const removeRiotAccount = onCall<{ puuid: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { puuid } = request.data
    const userId = request.auth.uid

    if (!puuid) {
      throw new HttpsError('invalid-argument', 'puuid is required')
    }

    try {
      const userRef = db.collection('users').doc(userId)
      const userDoc = await userRef.get()

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User profile not found')
      }

      const userData = userDoc.data()
      const accounts = userData?.riotAccounts || []
      const accountToRemove = accounts.find((acc: { puuid: string }) => acc.puuid === puuid)

      if (!accountToRemove) {
        throw new HttpsError('not-found', 'Account not found in your profile')
      }

      await userRef.update({
        riotAccounts: FieldValue.arrayRemove(accountToRemove),
        updatedAt: FieldValue.serverTimestamp(),
      })

      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error removing account:', error)
      throw new HttpsError('internal', 'Failed to remove account')
    }
  }
)

/**
 * Refresh rank data for a connected account
 */
export const refreshRiotAccountRank = onCall<{ puuid: string }>(
  { secrets: ['RIOT_API_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { puuid } = request.data
    const userId = request.auth.uid

    const apiKey = process.env.RIOT_API_KEY
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Riot API key not configured')
    }

    try {
      const userRef = db.collection('users').doc(userId)
      const userDoc = await userRef.get()

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User profile not found')
      }

      const userData = userDoc.data()
      const accounts = userData?.riotAccounts || []
      const accountIndex = accounts.findIndex((acc: { puuid: string }) => acc.puuid === puuid)

      if (accountIndex === -1) {
        throw new HttpsError('not-found', 'Account not found in your profile')
      }

      const account = accounts[accountIndex]
      const regionBase = getRegionalEndpoint(account.region)

      // Get summoner data
      const summonerResponse = await fetch(
        `${regionBase}/lol/summoner/v4/summoners/by-puuid/${puuid}`,
        { headers: { 'X-Riot-Token': apiKey } }
      )

      if (!summonerResponse.ok) {
        throw new HttpsError('internal', 'Failed to fetch summoner data')
      }

      const summonerData: SummonerResponse = await summonerResponse.json()

      // Get rank data using PUUID endpoint
      let rankInfo = null
      const rankedResponse = await fetch(
        `${regionBase}/lol/league/v4/entries/by-puuid/${puuid}`,
        { headers: { 'X-Riot-Token': apiKey } }
      )

      if (rankedResponse.ok) {
        const rankedData: RiotRankEntry[] = await rankedResponse.json()
        const soloQueue = rankedData.find(entry => entry.queueType === 'RANKED_SOLO_5x5')
        
        if (soloQueue) {
          rankInfo = {
            tier: soloQueue.tier,
            division: soloQueue.rank,
            lp: soloQueue.leaguePoints,
            wins: soloQueue.wins,
            losses: soloQueue.losses,
          }
        }
      }

      // Update the account in the array (use Date, not serverTimestamp, for array elements)
      accounts[accountIndex] = {
        ...account,
        profileIconId: summonerData.profileIconId,
        summonerLevel: summonerData.summonerLevel,
        rank: rankInfo,
        lastUpdated: new Date(),
      }

      await userRef.update({
        riotAccounts: accounts,
        updatedAt: FieldValue.serverTimestamp(),
      })

      return {
        success: true,
        rank: rankInfo,
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error refreshing rank:', error)
      throw new HttpsError('internal', 'Failed to refresh rank')
    }
  }
)

/**
 * Get recent matches for a Riot account
 */
export const getRecentMatches = onCall<{ puuid: string; region: string; count?: number }>(
  { secrets: ['RIOT_API_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { puuid, region, count = 5 } = request.data

    if (!puuid || !region) {
      throw new HttpsError('invalid-argument', 'puuid and region are required')
    }

    const apiKey = process.env.RIOT_API_KEY
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Riot API key not configured')
    }

    try {
      const routingRegion = getMatchRoutingRegion(region)
      
      // Get match IDs (only ranked solo/duo queue - queueId 420)
      const matchListUrl = `https://${routingRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=${count}`
      console.log('Fetching match list from:', matchListUrl)
      
      const matchListResponse = await fetch(matchListUrl, {
        headers: { 'X-Riot-Token': apiKey }
      })

      if (!matchListResponse.ok) {
        console.error('Match list error:', matchListResponse.status)
        throw new HttpsError('internal', 'Failed to fetch match history')
      }

      const matchIds: string[] = await matchListResponse.json()
      console.log('Found matches:', matchIds.length)

      // Fetch details for each match
      const matches = await Promise.all(
        matchIds.map(async (matchId) => {
          const matchUrl = `https://${routingRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`
          const matchResponse = await fetch(matchUrl, {
            headers: { 'X-Riot-Token': apiKey }
          })

          if (!matchResponse.ok) {
            console.error('Match detail error:', matchResponse.status, matchId)
            return null
          }

          const matchData = await matchResponse.json()
          
          // Find the participant data for our player
          const participant = matchData.info.participants.find(
            (p: { puuid: string }) => p.puuid === puuid
          )

          if (!participant) {
            console.error('Participant not found in match:', matchId)
            return null
          }

          const gameDurationMinutes = matchData.info.gameDuration / 60

          return {
            matchId,
            gameCreation: matchData.info.gameCreation,
            gameDuration: matchData.info.gameDuration,
            gameMode: matchData.info.gameMode,
            queueId: matchData.info.queueId,
            win: participant.win,
            championId: participant.championId,
            championName: participant.championName,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
            csPerMin: Math.round(((participant.totalMinionsKilled + participant.neutralMinionsKilled) / gameDurationMinutes) * 10) / 10,
            visionScore: participant.visionScore,
            totalDamageDealt: participant.totalDamageDealtToChampions,
            goldEarned: participant.goldEarned,
            role: participant.teamPosition || participant.individualPosition || 'UNKNOWN',
            lane: participant.lane,
          }
        })
      )

      // Filter out any failed fetches
      const validMatches = matches.filter(m => m !== null)
      console.log('Returning matches:', validMatches.length)

      return { matches: validMatches }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error fetching matches:', error)
      throw new HttpsError('internal', 'Failed to fetch match history')
    }
  }
)

/**
 * Get the regional endpoint for a given region code (for summoner/league APIs)
 */
function getRegionalEndpoint(region: string): string {
  const regionMap: Record<string, string> = {
    BR1: 'https://br1.api.riotgames.com',
    EUN1: 'https://eun1.api.riotgames.com',
    EUW1: 'https://euw1.api.riotgames.com',
    JP1: 'https://jp1.api.riotgames.com',
    KR: 'https://kr.api.riotgames.com',
    LA1: 'https://la1.api.riotgames.com',
    LA2: 'https://la2.api.riotgames.com',
    NA1: 'https://na1.api.riotgames.com',
    OC1: 'https://oc1.api.riotgames.com',
    PH2: 'https://ph2.api.riotgames.com',
    RU: 'https://ru.api.riotgames.com',
    SG2: 'https://sg2.api.riotgames.com',
    TH2: 'https://th2.api.riotgames.com',
    TR1: 'https://tr1.api.riotgames.com',
    TW2: 'https://tw2.api.riotgames.com',
    VN2: 'https://vn2.api.riotgames.com',
  }

  return regionMap[region] || regionMap.EUW1
}

/**
 * Get the routing region for Match-V5 API
 */
function getMatchRoutingRegion(region: string): string {
  // Match-V5 uses regional routing: americas, asia, europe, sea
  const routingMap: Record<string, string> = {
    // Americas
    BR1: 'americas',
    LA1: 'americas',
    LA2: 'americas',
    NA1: 'americas',
    // Asia
    JP1: 'asia',
    KR: 'asia',
    // Europe
    EUN1: 'europe',
    EUW1: 'europe',
    TR1: 'europe',
    RU: 'europe',
    // SEA
    OC1: 'sea',
    PH2: 'sea',
    SG2: 'sea',
    TH2: 'sea',
    TW2: 'sea',
    VN2: 'sea',
  }

  return routingMap[region] || 'europe'
}

// ============================================
// MMR System Functions
// ============================================

/**
 * Initialize MMR for a player based on their highest Riot rank
 */
export const initializePlayerMMR = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const userId = request.auth.uid

    try {
      // Check if player already has MMR
      const mmrDoc = await db.collection('mmr').doc(userId).get()
      if (mmrDoc.exists) {
        return { success: true, mmr: mmrDoc.data(), alreadyExists: true }
      }

      // Get user's Riot accounts to determine initial MMR
      const userDoc = await db.collection('users').doc(userId).get()
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User profile not found')
      }

      const userData = userDoc.data()
      const riotAccounts = userData?.riotAccounts || []
      
      // Extract ranks from Riot accounts
      const ranks = riotAccounts
        .filter((acc: { rank?: { tier: string } }) => acc.rank?.tier)
        .map((acc: { rank: { tier: string } }) => ({ tier: acc.rank.tier }))

      const initialMmr = getInitialMMR(ranks)

      // Create MMR document
      const mmrData = {
        odId: userId,
        mmr: initialMmr,
        placementGamesPlayed: 0,
        isPlaced: false,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        peakMmr: initialMmr,
        lastUpdated: FieldValue.serverTimestamp(),
        history: [],
      }

      await db.collection('mmr').doc(userId).set(mmrData)

      return { 
        success: true, 
        mmr: {
          ...mmrData,
          rank: getRankFromMMR(initialMmr),
        }
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error initializing MMR:', error)
      throw new HttpsError('internal', 'Failed to initialize MMR')
    }
  }
)

/**
 * Get a player's current MMR and stats
 */
export const getPlayerMMR = onCall<{ odId?: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const targetUserId = request.data.odId || request.auth.uid

    try {
      const mmrDoc = await db.collection('mmr').doc(targetUserId).get()
      
      if (!mmrDoc.exists) {
        return { success: true, mmr: null }
      }

      const mmrData = mmrDoc.data()!
      return {
        success: true,
        mmr: {
          ...mmrData,
          rank: getRankFromMMR(mmrData.mmr || 0),
          winRate: mmrData.gamesPlayed > 0 
            ? Math.round((mmrData.wins / mmrData.gamesPlayed) * 100) 
            : 0,
        }
      }
    } catch (error) {
      console.error('Error getting MMR:', error)
      throw new HttpsError('internal', 'Failed to get MMR')
    }
  }
)

/**
 * Get leaderboard (top players by MMR)
 */
export const getLeaderboard = onCall<{ limit?: number }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const limit = Math.min(request.data.limit || 50, 100)

    try {
      // Get top players by MMR who have completed placement
      const mmrSnapshot = await db.collection('mmr')
        .where('isPlaced', '==', true)
        .orderBy('mmr', 'desc')
        .limit(limit)
        .get()

      const leaderboard = await Promise.all(
        mmrSnapshot.docs.map(async (doc, index) => {
          const mmrData = doc.data()
          const odId = doc.id

          // Get user profile for display name
          const userDoc = await db.collection('users').doc(odId).get()
          const userData = userDoc.data()

          return {
            position: index + 1,
            odId: odId,
            displayName: userData?.displayName || 'Unknown',
            photoURL: userData?.photoURL,
            mmr: mmrData.mmr,
            rank: getRankFromMMR(mmrData.mmr),
            gamesPlayed: mmrData.gamesPlayed,
            wins: mmrData.wins,
            losses: mmrData.losses,
            winRate: mmrData.gamesPlayed > 0 
              ? Math.round((mmrData.wins / mmrData.gamesPlayed) * 100) 
              : 0,
          }
        })
      )

      return { success: true, leaderboard }
    } catch (error) {
      console.error('Error getting leaderboard:', error)
      throw new HttpsError('internal', 'Failed to get leaderboard')
    }
  }
)

interface SubmitMatchResultData {
  winner: 'blue' | 'red'
  blueTeam: {
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
  }[]
  redTeam: {
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
  }[]
}

/**
 * Submit match result and calculate MMR changes for all players
 */
export const submitMatchResult = onCall<SubmitMatchResultData>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { winner, blueTeam, redTeam } = request.data

    if (!winner || !blueTeam || !redTeam) {
      throw new HttpsError('invalid-argument', 'Missing required match data')
    }

    if (blueTeam.length !== 5 || redTeam.length !== 5) {
      throw new HttpsError('invalid-argument', 'Each team must have exactly 5 players')
    }

    try {
      // Get current MMR for all players
      const allPlayers = [...blueTeam, ...redTeam]
      const mmrDocs = await Promise.all(
        allPlayers.map(p => db.collection('mmr').doc(p.odId).get())
      )

      // Build player MMR map
      const playerMmrMap: Record<string, number> = {}
      const playerPlacementMap: Record<string, boolean> = {}
      
      for (let i = 0; i < allPlayers.length; i++) {
        const player = allPlayers[i]
        const mmrDoc = mmrDocs[i]
        
        if (!mmrDoc.exists) {
          // Initialize MMR for player who doesn't have it
          const userDoc = await db.collection('users').doc(player.odId).get()
          const userData = userDoc.data()
          const ranks = (userData?.riotAccounts || [])
            .filter((acc: { rank?: { tier: string } }) => acc.rank?.tier)
            .map((acc: { rank: { tier: string } }) => ({ tier: acc.rank.tier }))
          
          playerMmrMap[player.odId] = getInitialMMR(ranks)
          playerPlacementMap[player.odId] = false
        } else {
          const mmrData = mmrDoc.data()
          playerMmrMap[player.odId] = mmrData?.mmr || 800
          playerPlacementMap[player.odId] = mmrData?.placementGamesPlayed >= MMR_CONFIG.PLACEMENT_GAMES
        }
      }

      // Calculate team average MMRs
      const blueTeamMmrs = blueTeam.map(p => playerMmrMap[p.odId])
      const redTeamMmrs = redTeam.map(p => playerMmrMap[p.odId])
      const blueTeamAvgMmr = blueTeamMmrs.reduce((a, b) => a + b, 0) / 5
      const redTeamAvgMmr = redTeamMmrs.reduce((a, b) => a + b, 0) / 5

      // Build all player stats for performance calculation
      const allPlayerStats: PlayerStats[] = [
        ...blueTeam.map(p => ({
          odId: p.odId,
          team: 'blue' as const,
          kills: p.stats.kills,
          deaths: p.stats.deaths,
          assists: p.stats.assists,
          cs: p.stats.cs,
          damage: p.stats.damage,
          visionScore: p.stats.visionScore,
          objectiveScore: p.stats.objectiveScore,
          mmrAtTime: playerMmrMap[p.odId],
        })),
        ...redTeam.map(p => ({
          odId: p.odId,
          team: 'red' as const,
          kills: p.stats.kills,
          deaths: p.stats.deaths,
          assists: p.stats.assists,
          cs: p.stats.cs,
          damage: p.stats.damage,
          visionScore: p.stats.visionScore,
          objectiveScore: p.stats.objectiveScore,
          mmrAtTime: playerMmrMap[p.odId],
        })),
      ]

      const matchContext: MatchContext = {
        winner,
        blueTeamAvgMmr,
        redTeamAvgMmr,
        allPlayerStats,
      }

      // Create match document
      const matchRef = db.collection('matches').doc()
      const matchId = matchRef.id

      // Calculate MMR changes for all players
      const mmrChanges: Record<string, { change: number; performanceScore: number; newMmr: number }> = {}
      const playerMatchStats: Array<{
        odId: string
        oduid: string
        team: 'blue' | 'red'
        champion: string
        role: string
        kills: number
        deaths: number
        assists: number
        cs: number
        damage: number
        visionScore: number
        objectiveScore: number
        performanceScore: number
        mmrChange: number
      }> = []

      for (const playerStats of allPlayerStats) {
        const isPlacement = !playerPlacementMap[playerStats.odId]
        const { change, performanceScore } = calculateMMRChange(
          playerStats,
          matchContext,
          isPlacement
        )

        const currentMmr = playerMmrMap[playerStats.odId]
        const newMmr = applyMMRChange(currentMmr, change)

        mmrChanges[playerStats.odId] = {
          change,
          performanceScore,
          newMmr,
        }

        // Find player data for match stats
        const playerData = [...blueTeam, ...redTeam].find(p => p.odId === playerStats.odId)!
        
        playerMatchStats.push({
          odId: playerStats.odId,
          oduid: playerData.oduid,
          team: playerStats.team,
          champion: playerData.stats.champion,
          role: playerData.role,
          kills: playerStats.kills,
          deaths: playerStats.deaths,
          assists: playerStats.assists,
          cs: playerStats.cs,
          damage: playerStats.damage,
          visionScore: playerStats.visionScore,
          objectiveScore: playerStats.objectiveScore,
          performanceScore,
          mmrChange: change,
        })
      }

      // Save match document
      await matchRef.set({
        id: matchId,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        status: 'completed',
        blueTeam: {
          players: blueTeam.map(p => ({
            odId: p.odId,
            oduid: p.oduid,
            displayName: p.displayName,
            role: p.role,
            mmrAtTime: playerMmrMap[p.odId],
          })),
          avgMmr: blueTeamAvgMmr,
        },
        redTeam: {
          players: redTeam.map(p => ({
            odId: p.odId,
            oduid: p.oduid,
            displayName: p.displayName,
            role: p.role,
            mmrAtTime: playerMmrMap[p.odId],
          })),
          avgMmr: redTeamAvgMmr,
        },
        winner,
        playerStats: playerMatchStats,
        mmrProcessed: true,
      })

      // Update MMR for all players
      const batch = db.batch()

      for (const player of allPlayers) {
        const mmrRef = db.collection('mmr').doc(player.odId)
        const currentMmr = playerMmrMap[player.odId]
        const { change, performanceScore, newMmr } = mmrChanges[player.odId]
        const didWin = (blueTeam.some(p => p.odId === player.odId) && winner === 'blue') ||
                       (redTeam.some(p => p.odId === player.odId) && winner === 'red')

        const mmrDoc = mmrDocs.find((_, i) => allPlayers[i].odId === player.odId)
        const existingData = mmrDoc?.data()
        const currentGamesPlayed = existingData?.gamesPlayed || 0
        const currentPlacementGames = existingData?.placementGamesPlayed || 0
        const currentWins = existingData?.wins || 0
        const currentLosses = existingData?.losses || 0
        const currentPeakMmr = existingData?.peakMmr || currentMmr

        const historyEntry = {
          matchId,
          mmrBefore: currentMmr,
          mmrAfter: newMmr,
          change,
          performanceScore,
          timestamp: new Date(),
        }

        if (mmrDoc?.exists) {
          batch.update(mmrRef, {
            mmr: newMmr,
            gamesPlayed: currentGamesPlayed + 1,
            placementGamesPlayed: Math.min(currentPlacementGames + 1, MMR_CONFIG.PLACEMENT_GAMES),
            isPlaced: currentPlacementGames + 1 >= MMR_CONFIG.PLACEMENT_GAMES,
            wins: didWin ? currentWins + 1 : currentWins,
            losses: didWin ? currentLosses : currentLosses + 1,
            peakMmr: Math.max(currentPeakMmr, newMmr),
            lastUpdated: FieldValue.serverTimestamp(),
            history: FieldValue.arrayUnion(historyEntry),
          })
        } else {
          batch.set(mmrRef, {
            odId: player.odId,
            mmr: newMmr,
            gamesPlayed: 1,
            placementGamesPlayed: 1,
            isPlaced: 1 >= MMR_CONFIG.PLACEMENT_GAMES,
            wins: didWin ? 1 : 0,
            losses: didWin ? 0 : 1,
            peakMmr: newMmr,
            lastUpdated: FieldValue.serverTimestamp(),
            history: [historyEntry],
          })
        }
      }

      await batch.commit()

      return {
        success: true,
        matchId,
        mmrChanges: Object.entries(mmrChanges).map(([odId, data]) => ({
          odId,
          ...data,
          rank: getRankFromMMR(data.newMmr),
        })),
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error submitting match result:', error)
      throw new HttpsError('internal', 'Failed to submit match result')
    }
  }
)

/**
 * Get match history for a player
 */
export const getMatchHistory = onCall<{ odId?: string; limit?: number }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const targetUserId = request.data.odId || request.auth.uid
    const limit = Math.min(request.data.limit || 20, 50)

    try {
      // Get matches where this player participated
      // Note: We query all recent matches and filter client-side because
      // Firestore doesn't support querying nested array fields efficiently
      const recentMatches = await db.collection('matches')
        .orderBy('createdAt', 'desc')
        .limit(limit * 2)
        .get()

      const matches = recentMatches.docs
        .filter(doc => {
          const data = doc.data()
          const bluePlayerIds = data.blueTeam?.players?.map((p: { odId: string }) => p.odId) || []
          const redPlayerIds = data.redTeam?.players?.map((p: { odId: string }) => p.odId) || []
          return bluePlayerIds.includes(targetUserId) || redPlayerIds.includes(targetUserId)
        })
        .slice(0, limit)
        .map(doc => {
          const data = doc.data()
          const playerStats = data.playerStats?.find((ps: { odId: string }) => ps.odId === targetUserId)
          
          return {
            id: doc.id,
            createdAt: data.createdAt,
            winner: data.winner,
            playerTeam: playerStats?.team,
            didWin: playerStats?.team === data.winner,
            playerStats,
            blueTeamAvgMmr: data.blueTeam?.avgMmr,
            redTeamAvgMmr: data.redTeam?.avgMmr,
          }
        })

      return { success: true, matches }
    } catch (error) {
      console.error('Error getting match history:', error)
      throw new HttpsError('internal', 'Failed to get match history')
    }
  }
)

// ============================================
// Champion Data Functions
// ============================================

const DATA_DRAGON_BASE = 'https://ddragon.leagueoflegends.com'

interface ChampionData {
  id: string
  key: string
  name: string
  title: string
  image: { full: string }
  tags: string[]
}

/**
 * Get champion list from Riot Data Dragon (cached in Firestore)
 */
export const getChampions = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    try {
      // Check cache first
      const cacheDoc = await db.collection('cache').doc('champions').get()
      const cacheData = cacheDoc.data()
      
      // Cache for 7 days (champions rarely change)
      const CACHE_TTL = 7 * 24 * 60 * 60 * 1000
      
      if (cacheData && cacheData.updatedAt) {
        const cacheAge = Date.now() - cacheData.updatedAt.toMillis()
        if (cacheAge < CACHE_TTL) {
          return { success: true, champions: cacheData.champions, version: cacheData.version }
        }
      }

      // Fetch latest version
      const versionResponse = await fetch(`${DATA_DRAGON_BASE}/api/versions.json`)
      if (!versionResponse.ok) {
        throw new Error('Failed to fetch Data Dragon versions')
      }
      const versions = await versionResponse.json() as string[]
      const latestVersion = versions[0]

      // Fetch champion data
      const champResponse = await fetch(
        `${DATA_DRAGON_BASE}/cdn/${latestVersion}/data/en_US/champion.json`
      )
      if (!champResponse.ok) {
        throw new Error('Failed to fetch champion data')
      }
      const champData = await champResponse.json() as { data: Record<string, ChampionData> }

      // Transform to our format
      const champions = Object.values(champData.data).map((champ) => ({
        id: champ.id,
        key: champ.key,
        name: champ.name,
        title: champ.title,
        image: `${DATA_DRAGON_BASE}/cdn/${latestVersion}/img/champion/${champ.image.full}`,
        tags: champ.tags,
      }))

      // Sort alphabetically
      champions.sort((a, b) => a.name.localeCompare(b.name))

      // Update cache
      await db.collection('cache').doc('champions').set({
        champions,
        version: latestVersion,
        updatedAt: FieldValue.serverTimestamp(),
      })

      return { success: true, champions, version: latestVersion }
    } catch (error) {
      console.error('Error fetching champions:', error)
      throw new HttpsError('internal', 'Failed to fetch champion data')
    }
  }
)

// ============================================
// Queue System Functions
// ============================================

type PlayerRole = 'top' | 'jungle' | 'mid' | 'adc' | 'support'

interface JoinQueueData {
  role: PlayerRole
  region: string
}

/**
 * Join the matchmaking queue
 */
export const joinQueue = onCall<JoinQueueData>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { role, region } = request.data
    const userId = request.auth.uid

    if (!role || !region) {
      throw new HttpsError('invalid-argument', 'Role and region are required')
    }

    const validRoles: PlayerRole[] = ['top', 'jungle', 'mid', 'adc', 'support']
    if (!validRoles.includes(role)) {
      throw new HttpsError('invalid-argument', 'Invalid role')
    }

    try {
      // Check if already in queue
      const existingEntry = await db.collection('queue')
        .where('odId', '==', userId)
        .limit(1)
        .get()

      if (!existingEntry.empty) {
        throw new HttpsError('already-exists', 'Already in queue')
      }

      // Check if already in a draft
      const activeDrafts = await db.collection('drafts')
        .where('status', 'in', ['waiting', 'banning', 'picking'])
        .get()

      for (const draft of activeDrafts.docs) {
        const data = draft.data()
        const allPlayers = [...(data.blueTeam || []), ...(data.redTeam || [])]
        if (allPlayers.some((p: { odId: string }) => p.odId === userId)) {
          throw new HttpsError('failed-precondition', 'Already in an active draft')
        }
      }

      // Get user profile
      const userDoc = await db.collection('users').doc(userId).get()
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User profile not found')
      }
      const userData = userDoc.data()!

      // Get MMR
      const mmrDoc = await db.collection('mmr').doc(userId).get()
      const mmr = mmrDoc.exists ? mmrDoc.data()?.mmr || 800 : 800

      // Add to queue
      const queueEntry = {
        odId: userId,
        oduid: userData.uid,
        displayName: userData.displayName,
        photoURL: userData.photoURL || null,
        role,
        mmr,
        region,
        joinedAt: FieldValue.serverTimestamp(),
      }

      await db.collection('queue').doc(userId).set(queueEntry)

      // Try to find a match
      const matchResult = await tryMatchPlayers()

      return { 
        success: true, 
        inQueue: true,
        matchFound: matchResult.found,
        draftId: matchResult.draftId,
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error joining queue:', error)
      throw new HttpsError('internal', 'Failed to join queue')
    }
  }
)

/**
 * Leave the matchmaking queue
 */
export const leaveQueue = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const userId = request.auth.uid

    try {
      await db.collection('queue').doc(userId).delete()
      return { success: true }
    } catch (error) {
      console.error('Error leaving queue:', error)
      throw new HttpsError('internal', 'Failed to leave queue')
    }
  }
)

/**
 * Get current queue status
 */
export const getQueueStatus = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const userId = request.auth.uid

    try {
      // Check if user is in queue
      const queueEntry = await db.collection('queue').doc(userId).get()
      
      // Get queue counts by role
      const queueSnapshot = await db.collection('queue').get()
      const roleCount: Record<PlayerRole, number> = {
        top: 0,
        jungle: 0,
        mid: 0,
        adc: 0,
        support: 0,
      }

      queueSnapshot.docs.forEach(doc => {
        const role = doc.data().role as PlayerRole
        if (role in roleCount) {
          roleCount[role]++
        }
      })

      return {
        success: true,
        inQueue: queueEntry.exists,
        queueEntry: queueEntry.exists ? queueEntry.data() : null,
        playersInQueue: queueSnapshot.size,
        roleCount,
      }
    } catch (error) {
      console.error('Error getting queue status:', error)
      throw new HttpsError('internal', 'Failed to get queue status')
    }
  }
)

/**
 * Try to match 10 players from the queue
 */
async function tryMatchPlayers(): Promise<{ found: boolean; draftId?: string }> {
  const roles: PlayerRole[] = ['top', 'jungle', 'mid', 'adc', 'support']
  
  // Get all players in queue grouped by role
  const playersByRole: Record<PlayerRole, Array<{ odId: string; mmr: number; data: FirebaseFirestore.DocumentData }>> = {
    top: [],
    jungle: [],
    mid: [],
    adc: [],
    support: [],
  }

  const queueSnapshot = await db.collection('queue').get()
  
  queueSnapshot.docs.forEach(doc => {
    const data = doc.data()
    const role = data.role as PlayerRole
    if (roles.includes(role)) {
      playersByRole[role].push({
        odId: doc.id,
        mmr: data.mmr,
        data,
      })
    }
  })

  // Check if we have at least 2 players for each role
  for (const role of roles) {
    if (playersByRole[role].length < 2) {
      return { found: false }
    }
  }

  // Select 2 players per role (closest MMR pairs for balance)
  const selectedPlayers: Array<{ odId: string; mmr: number; role: PlayerRole; data: FirebaseFirestore.DocumentData }> = []
  
  for (const role of roles) {
    // Sort by MMR
    const rolePlayers = playersByRole[role].sort((a, b) => a.mmr - b.mmr)
    
    // Take first 2 players
    selectedPlayers.push(
      { ...rolePlayers[0], role },
      { ...rolePlayers[1], role }
    )
  }

  // Balance teams by MMR
  const { blueTeam, redTeam } = balanceTeams(selectedPlayers)

  // Create draft session
  const draftRef = db.collection('drafts').doc()
  const draftId = draftRef.id

  const blueTeamPlayers = blueTeam.map(p => ({
    odId: p.odId,
    oduid: p.data.oduid,
    displayName: p.data.displayName,
    photoURL: p.data.photoURL,
    role: p.role,
    team: 'blue' as const,
    mmr: p.mmr,
    isReady: false,
  }))

  const redTeamPlayers = redTeam.map(p => ({
    odId: p.odId,
    oduid: p.data.oduid,
    displayName: p.data.displayName,
    photoURL: p.data.photoURL,
    role: p.role,
    team: 'red' as const,
    mmr: p.mmr,
    isReady: false,
  }))

  const blueTeamAvgMmr = blueTeam.reduce((sum, p) => sum + p.mmr, 0) / 5
  const redTeamAvgMmr = redTeam.reduce((sum, p) => sum + p.mmr, 0) / 5

  // Create draft actions (ban/pick order)
  const actions = createDraftActions()

  const draftData = {
    id: draftId,
    createdAt: FieldValue.serverTimestamp(),
    status: 'waiting',
    currentPhase: 0,
    currentTeam: 'blue',
    phaseType: 'ban',
    phaseStartedAt: FieldValue.serverTimestamp(),
    phaseTimeLimit: 30,
    blueTeam: blueTeamPlayers,
    redTeam: redTeamPlayers,
    blueTeamAvgMmr,
    redTeamAvgMmr,
    actions,
    bannedChampions: [],
    fearlessMode: false,
  }

  // Use batch to atomically create draft and remove players from queue
  const batch = db.batch()
  
  batch.set(draftRef, draftData)
  
  for (const player of selectedPlayers) {
    batch.delete(db.collection('queue').doc(player.odId))
  }

  await batch.commit()

  return { found: true, draftId }
}

/**
 * Balance 10 players into two teams with similar MMR
 */
function balanceTeams(
  players: Array<{ odId: string; mmr: number; role: PlayerRole; data: FirebaseFirestore.DocumentData }>
): {
  blueTeam: typeof players
  redTeam: typeof players
} {
  const blueTeam: typeof players = []
  const redTeam: typeof players = []

  // Group by role
  const byRole: Record<PlayerRole, typeof players> = {
    top: [],
    jungle: [],
    mid: [],
    adc: [],
    support: [],
  }

  for (const player of players) {
    byRole[player.role].push(player)
  }

  // For each role, assign players to balance total MMR
  const roles: PlayerRole[] = ['top', 'jungle', 'mid', 'adc', 'support']
  
  for (const role of roles) {
    const [p1, p2] = byRole[role].sort((a, b) => b.mmr - a.mmr)
    
    // Calculate current team totals
    const blueTotal = blueTeam.reduce((sum, p) => sum + p.mmr, 0)
    const redTotal = redTeam.reduce((sum, p) => sum + p.mmr, 0)

    // Assign higher MMR player to team with lower total
    if (blueTotal <= redTotal) {
      blueTeam.push(p1)
      redTeam.push(p2)
    } else {
      blueTeam.push(p2)
      redTeam.push(p1)
    }
  }

  return { blueTeam, redTeam }
}

/**
 * Create the draft action sequence
 * Ban phase: B R B R B R (6 bans total)
 * Pick phase: B R R B B R R B B R (10 picks)
 */
function createDraftActions() {
  const actions: Array<{
    phase: number
    type: 'ban' | 'pick'
    team: 'blue' | 'red'
    championId: null
    championName: null
    completedAt: null
    isActive: boolean
  }> = []

  // Ban phase: B R B R B R
  const banOrder: Array<'blue' | 'red'> = ['blue', 'red', 'blue', 'red', 'blue', 'red']
  banOrder.forEach((team, i) => {
    actions.push({
      phase: i,
      type: 'ban',
      team,
      championId: null,
      championName: null,
      completedAt: null,
      isActive: i === 0,
    })
  })

  // Pick phase: B R R B B R R B B R
  const pickOrder: Array<'blue' | 'red'> = [
    'blue', 'red', 'red', 'blue', 'blue', 'red', 'red', 'blue', 'blue', 'red'
  ]
  pickOrder.forEach((team, i) => {
    actions.push({
      phase: 6 + i, // After 6 bans
      type: 'pick',
      team,
      championId: null,
      championName: null,
      completedAt: null,
      isActive: false,
    })
  })

  return actions
}

// ============================================
// Draft System Functions
// ============================================

/**
 * Get draft session by ID
 */
export const getDraft = onCall<{ draftId: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { draftId } = request.data
    if (!draftId) {
      throw new HttpsError('invalid-argument', 'Draft ID is required')
    }

    try {
      const draftDoc = await db.collection('drafts').doc(draftId).get()
      
      if (!draftDoc.exists) {
        throw new HttpsError('not-found', 'Draft not found')
      }

      return { success: true, draft: draftDoc.data() }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error getting draft:', error)
      throw new HttpsError('internal', 'Failed to get draft')
    }
  }
)

/**
 * Mark player as ready in draft
 */
export const setDraftReady = onCall<{ draftId: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { draftId } = request.data
    const userId = request.auth.uid

    try {
      const draftRef = db.collection('drafts').doc(draftId)
      const draftDoc = await draftRef.get()
      
      if (!draftDoc.exists) {
        throw new HttpsError('not-found', 'Draft not found')
      }

      const draftData = draftDoc.data()!
      
      if (draftData.status !== 'waiting') {
        throw new HttpsError('failed-precondition', 'Draft is not in waiting state')
      }

      // Find and update player
      let found = false
      const blueTeam = draftData.blueTeam.map((p: { odId: string; isReady: boolean }) => {
        if (p.odId === userId) {
          found = true
          return { ...p, isReady: true }
        }
        return p
      })

      const redTeam = draftData.redTeam.map((p: { odId: string; isReady: boolean }) => {
        if (p.odId === userId) {
          found = true
          return { ...p, isReady: true }
        }
        return p
      })

      if (!found) {
        throw new HttpsError('permission-denied', 'Not a participant in this draft')
      }

      // Check if all players are ready
      const allReady = [...blueTeam, ...redTeam].every((p: { isReady: boolean }) => p.isReady)

      const updateData: Record<string, unknown> = {
        blueTeam,
        redTeam,
      }

      if (allReady) {
        updateData.status = 'banning'
        updateData.phaseStartedAt = FieldValue.serverTimestamp()
      }

      await draftRef.update(updateData)

      return { success: true, allReady }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error setting ready:', error)
      throw new HttpsError('internal', 'Failed to set ready')
    }
  }
)

interface DraftActionData {
  draftId: string
  championId: string
  championName: string
}

/**
 * Make a draft action (ban or pick)
 */
export const makeDraftAction = onCall<DraftActionData>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { draftId, championId, championName } = request.data
    const userId = request.auth.uid

    if (!draftId || !championId || !championName) {
      throw new HttpsError('invalid-argument', 'Missing required fields')
    }

    try {
      const draftRef = db.collection('drafts').doc(draftId)
      
      // Use transaction for consistency
      const result = await db.runTransaction(async (transaction) => {
        const draftDoc = await transaction.get(draftRef)
        
        if (!draftDoc.exists) {
          throw new HttpsError('not-found', 'Draft not found')
        }

        const draftData = draftDoc.data()!
        
        if (!['banning', 'picking'].includes(draftData.status)) {
          throw new HttpsError('failed-precondition', 'Draft is not in active phase')
        }

        // Find current active action
        const currentPhase = draftData.currentPhase
        const actions = draftData.actions
        const currentAction = actions[currentPhase]

        if (!currentAction || !currentAction.isActive) {
          throw new HttpsError('failed-precondition', 'No active action')
        }

        // Verify it's this player's team's turn
        const playerTeam = draftData.blueTeam.some((p: { odId: string }) => p.odId === userId)
          ? 'blue'
          : draftData.redTeam.some((p: { odId: string }) => p.odId === userId)
          ? 'red'
          : null

        if (!playerTeam) {
          throw new HttpsError('permission-denied', 'Not a participant in this draft')
        }

        if (currentAction.team !== playerTeam) {
          throw new HttpsError('permission-denied', 'Not your team\'s turn')
        }

        // Check if champion is already banned or picked
        const bannedChampions = draftData.bannedChampions || []
        const pickedChampions = actions
          .filter((a: { type: string; championId: string }) => a.type === 'pick' && a.championId)
          .map((a: { championId: string }) => a.championId)

        if (bannedChampions.includes(championId) || pickedChampions.includes(championId)) {
          throw new HttpsError('invalid-argument', 'Champion already banned or picked')
        }

        // Update the action
        actions[currentPhase] = {
          ...currentAction,
          championId,
          championName,
          completedAt: new Date(),
          isActive: false,
        }

        // Prepare update
        const updateData: Record<string, unknown> = {
          actions,
        }

        // If this was a ban, add to banned champions
        if (currentAction.type === 'ban') {
          updateData.bannedChampions = FieldValue.arrayUnion(championId)
        }

        // If this was a pick, update the player's champion
        if (currentAction.type === 'pick') {
          // Find which role should get this champion (based on pick order)
          // For simplicity, assign to next unpicked player on that team
          const team = currentAction.team === 'blue' ? 'blueTeam' : 'redTeam'
          const teamPlayers = draftData[team] as Array<{ championId?: string }>
          const unpickedPlayer = teamPlayers.find(p => !p.championId)
          
          if (unpickedPlayer) {
            const updatedTeam = teamPlayers.map(p => 
              p === unpickedPlayer 
                ? { ...p, championId, championName }
                : p
            )
            updateData[team] = updatedTeam
          }
        }

        // Move to next phase
        const nextPhase = currentPhase + 1
        
        if (nextPhase >= actions.length) {
          // Draft complete
          updateData.status = 'completed'
          updateData.currentPhase = currentPhase
          
          // Generate lobby credentials
          updateData.lobbyName = `Drafty-${draftId.slice(0, 8)}`
          updateData.lobbyPassword = Math.random().toString(36).slice(2, 10)
        } else {
          // Move to next action
          actions[nextPhase].isActive = true
          updateData.currentPhase = nextPhase
          updateData.currentTeam = actions[nextPhase].team
          updateData.phaseType = actions[nextPhase].type
          updateData.phaseStartedAt = FieldValue.serverTimestamp()
          
          // Update status if transitioning from ban to pick
          if (actions[nextPhase].type === 'pick' && draftData.status === 'banning') {
            updateData.status = 'picking'
          }
        }

        transaction.update(draftRef, updateData)

        return { 
          nextPhase: nextPhase < actions.length ? nextPhase : null,
          completed: nextPhase >= actions.length,
        }
      })

      return { success: true, ...result }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error making draft action:', error)
      throw new HttpsError('internal', 'Failed to make draft action')
    }
  }
)

/**
 * Cancel/timeout a draft action (when timer expires)
 */
export const timeoutDraftAction = onCall<{ draftId: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const { draftId } = request.data

    try {
      const draftRef = db.collection('drafts').doc(draftId)
      const draftDoc = await draftRef.get()
      
      if (!draftDoc.exists) {
        throw new HttpsError('not-found', 'Draft not found')
      }

      const draftData = draftDoc.data()!

      // Verify user is part of this draft
      const userId = request.auth.uid
      const isParticipant = 
        draftData.blueTeam.some((p: { odId: string }) => p.odId === userId) ||
        draftData.redTeam.some((p: { odId: string }) => p.odId === userId)

      if (!isParticipant) {
        throw new HttpsError('permission-denied', 'Not a participant')
      }

      // Cancel the draft
      await draftRef.update({
        status: 'cancelled',
        cancelReason: 'timeout',
      })

      return { success: true }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Error timing out draft:', error)
      throw new HttpsError('internal', 'Failed to timeout draft')
    }
  }
)

/**
 * Get user's active draft (if any)
 */
export const getActiveDraft = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const userId = request.auth.uid

    try {
      // Find drafts where user is a participant and status is active
      const draftsSnapshot = await db.collection('drafts')
        .where('status', 'in', ['waiting', 'banning', 'picking'])
        .get()

      for (const doc of draftsSnapshot.docs) {
        const data = doc.data()
        const isParticipant = 
          data.blueTeam.some((p: { odId: string }) => p.odId === userId) ||
          data.redTeam.some((p: { odId: string }) => p.odId === userId)

        if (isParticipant) {
          return { success: true, draft: data }
        }
      }

      return { success: true, draft: null }
    } catch (error) {
      console.error('Error getting active draft:', error)
      throw new HttpsError('internal', 'Failed to get active draft')
    }
  }
)
