interface TeamRow {
  team_id: string
  teamName?: string
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_diff: number
  points: number
}

interface Props {
  groupName: string
  rows: TeamRow[]
}

export default function GroupStandings({ groupName, rows }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 bg-rugby-green/5 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">{groupName}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100">
              <th className="text-left px-4 py-2 font-medium">#</th>
              <th className="text-left px-4 py-2 font-medium">Squadra</th>
              <th className="px-2 py-2 font-medium">G</th>
              <th className="px-2 py-2 font-medium">V</th>
              <th className="px-2 py-2 font-medium">P</th>
              <th className="px-2 py-2 font-medium">S</th>
              <th className="px-2 py-2 font-medium">+/-</th>
              <th className="px-2 py-2 font-medium font-bold">Pt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.team_id} className={`border-b border-gray-50 ${idx === 0 ? 'bg-rugby-green/5' : ''}`}>
                <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{row.teamName || row.team_id.slice(0, 8)}</td>
                <td className="px-2 py-3 text-center text-gray-600">{row.played}</td>
                <td className="px-2 py-3 text-center text-gray-600">{row.won}</td>
                <td className="px-2 py-3 text-center text-gray-600">{row.drawn}</td>
                <td className="px-2 py-3 text-center text-gray-600">{row.lost}</td>
                <td className={`px-2 py-3 text-center font-medium ${row.goal_diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {row.goal_diff > 0 ? '+' : ''}{row.goal_diff}
                </td>
                <td className="px-2 py-3 text-center font-bold text-gray-900">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
