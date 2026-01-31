import Layout from '@/components/Layout'
import { MatchEntryForm } from '@/components/MatchEntryForm'
import { useNavigate } from 'react-router-dom'

export default function SubmitMatch() {
  const navigate = useNavigate()

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Submit Match Result</h1>
          <p className="text-muted-foreground mt-1">
            Enter the stats from your scrim match to update MMR
          </p>
        </div>

        <MatchEntryForm 
          onSuccess={() => {
            // Optionally navigate to leaderboard after submission
          }} 
        />
      </div>
    </Layout>
  )
}
