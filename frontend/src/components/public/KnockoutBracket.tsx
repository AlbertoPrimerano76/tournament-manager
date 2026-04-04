interface BracketMatch {
  id?: string
  homeTeam?: string
  awayTeam?: string
  homeScore?: number | null
  awayScore?: number | null
  status?: string
}

interface BracketRound {
  roundName: string
  roundOrder: number
  matches: BracketMatch[]
}

interface Props {
  rounds: BracketRound[]
}

export default function KnockoutBracket({ rounds }: Props) {
  if (!rounds || rounds.length === 0) {
    return <div className="text-center text-gray-400 py-8">Bracket non ancora disponibile</div>
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-6 min-w-max px-2">
        {rounds.map((round) => (
          <div key={round.roundOrder} className="flex flex-col gap-4">
            <h4 className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide pb-1 border-b border-gray-200">
              {round.roundName}
            </h4>
            <div className="flex flex-col gap-4 justify-around flex-1">
              {round.matches.map((match, idx) => (
                <BracketMatchCard key={idx} match={match} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BracketMatchCard({ match }: { match: BracketMatch }) {
  const isCompleted = match.status === 'COMPLETED'
  const homeWon = isCompleted && match.homeScore !== null && match.awayScore !== null && match.homeScore! > match.awayScore!
  const awayWon = isCompleted && match.homeScore !== null && match.awayScore !== null && match.awayScore! > match.homeScore!

  return (
    <div className="w-48 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <TeamRow name={match.homeTeam} score={match.homeScore} won={homeWon} />
      <div className="h-px bg-gray-100" />
      <TeamRow name={match.awayTeam} score={match.awayScore} won={awayWon} />
    </div>
  )
}

function TeamRow({ name, score, won }: { name?: string; score?: number | null; won: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 text-sm ${won ? 'bg-rugby-green/10' : ''}`}>
      <span className={`font-medium truncate ${name ? 'text-gray-900' : 'text-gray-400 italic'} ${won ? 'text-rugby-green' : ''}`}>
        {name || 'TBD'}
      </span>
      {score !== null && score !== undefined && (
        <span className={`font-bold ml-2 ${won ? 'text-rugby-green' : 'text-gray-600'}`}>{score}</span>
      )}
    </div>
  )
}
