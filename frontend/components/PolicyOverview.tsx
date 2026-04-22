'use client';

export default function PolicyOverview() {
  return (
    <div className="space-y-10">
      {/* Summary */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Missouri Income Tax Elimination
        </h2>
        <p className="text-gray-700 mb-4">
          Missouri House Joint Resolutions <strong>173</strong> and
          <strong> 174</strong> propose a constitutional amendment that would
          authorize the General Assembly to reduce or eliminate Missouri&apos;s
          individual income tax. Because the measure amends the state
          constitution, it must be ratified by Missouri voters in a statewide
          referendum before taking effect. The resolutions do not prescribe a
          specific implementation path &mdash; they do not set a timeline, a
          trigger formula, or mandated revenue offsets, leaving those details
          to subsequent legislation. This dashboard allows users to examine
          several plausible elimination paths and their projected effects on
          households and state revenue.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Proposal</h3>
            <p className="text-sm text-gray-600">
              A constitutional amendment authorizing the General Assembly to
              reduce or eliminate the individual income tax. Ratification
              requires approval by Missouri voters in a statewide referendum.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Current law</h3>
            <p className="text-sm text-gray-600">
              Missouri&apos;s 2025 income tax has eight brackets ranging from
              0% to a 4.7% top rate &mdash; one of the lower top rates among
              states that levy an income tax.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Scenarios modeled</h3>
            <p className="text-sm text-gray-600">
              Four reform types are available: a proportional reduction in all
              bracket rates, a cap on the top marginal rate, elimination of the
              top bracket, or full repeal of the income tax.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Methodology and limitations</h3>
            <p className="text-sm text-gray-600">
              Results are static estimates that do not incorporate behavioral
              responses. State revenue impacts are projected for fiscal years
              2026&ndash;2035 using PolicyEngine&apos;s microsimulation of
              Missouri tax units.
            </p>
          </div>
        </div>
      </div>

      {/* Current parameters */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Missouri 2025 income tax brackets
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-900">
                  Bracket
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">
                  Rate
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$0 &ndash; $1,313</td>
                <td className="py-3 px-4 text-right text-gray-700">0%</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$1,313 &ndash; $2,626</td>
                <td className="py-3 px-4 text-right text-gray-700">2%</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$2,626 &ndash; $3,939</td>
                <td className="py-3 px-4 text-right text-gray-700">2.5%</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$3,939 &ndash; $5,252</td>
                <td className="py-3 px-4 text-right text-gray-700">3%</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$5,252 &ndash; $6,565</td>
                <td className="py-3 px-4 text-right text-gray-700">3.5%</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$6,565 &ndash; $7,878</td>
                <td className="py-3 px-4 text-right text-gray-700">4%</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$7,878 &ndash; $9,191</td>
                <td className="py-3 px-4 text-right text-gray-700">4.5%</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 text-gray-700">$9,191+</td>
                <td className="py-3 px-4 text-right font-semibold text-primary-600">
                  4.7%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 italic mt-3">
          Bracket thresholds are inflation-adjusted each year. 2025 values shown.
        </p>
      </div>

      {/* References */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">References</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-2">
              Missouri HJR 173 &amp; 174
            </h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>
                <a
                  href="https://documents.house.mo.gov/billtracking/bills261/hlrbillspdf/6854S.13T.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  HJR 173 &mdash; bill text (PDF)
                </a>
              </li>
            </ul>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-2">
              Missouri Department of Revenue
            </h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>
                <a
                  href="https://dor.mo.gov/taxation/individual/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  Individual income tax information
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
