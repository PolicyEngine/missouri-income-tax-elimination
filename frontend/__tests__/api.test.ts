import { afterEach, describe, expect, it, vi } from "vitest";

import {
  api,
  createPolicy,
  householdCalculationLimit,
  householdCalculationPauseRemaining,
  pauseHouseholdCalculations,
  pollEconomicImpact,
} from "@/lib/api";
import { buildHouseholdSituation } from "@/lib/household";
import type { HouseholdRequest } from "@/lib/types";

const DASHBOARD_API = "https://www.policyengine.org/api";

const householdRequest: HouseholdRequest = {
  age_head: 35,
  age_spouse: null,
  dependent_ages: [5],
  income: 75000,
  year: 2027,
  max_earnings: 400000,
  state_code: "MO",
};

// A user's reform: Missouri's top rate set to zero from 2027.
const reform = {
  "gov.states.mo.tax.income.rates.rates[7].rate": {
    "2027-01-01.2100-12-31": 0,
  },
};

interface RecordedRequest {
  url: string;
  method: string | undefined;
  body: unknown;
}

type Respond = (
  request: RecordedRequest,
  init: RequestInit,
) => Response | Promise<Response>;

/** Replaces the global fetch; returns the requests it receives. */
function stubFetch(respond: Respond): RecordedRequest[] {
  const recordedRequests: RecordedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const request = {
        url: String(input),
        method: init.method,
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
      };
      recordedRequests.push(request);
      return respond(request, init);
    }),
  );
  return recordedRequests;
}

/** The Public API's calculated household, with values over the income axis. */
function calculatedHousehold(
  incomes: number[],
  netIncomes: number[],
  federalIncomeTaxes: number[],
  missouriIncomeTaxes: number[],
) {
  return {
    people: { you: { employment_income: { "2027": incomes } } },
    tax_units: {
      "your tax unit": {
        income_tax: { "2027": federalIncomeTaxes },
        mo_income_tax: { "2027": missouriIncomeTaxes },
      },
    },
    households: {
      "your household": { household_net_income: { "2027": netIncomes } },
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okAnswer(result: unknown): Response {
  return jsonResponse(200, { status: "ok", message: null, result });
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("The request did not fail.");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // The limit is shared by the page; each test starts with a fresh minute.
  householdCalculationLimit.clear();
  pauseHouseholdCalculations(0);
});

describe("calculateHouseholdImpact", () => {
  it("sends no household calculation while calculations are paused", async () => {
    const requests = stubFetch(() =>
      okAnswer(calculatedHousehold([0], [0], [0], [0])),
    );
    pauseHouseholdCalculations();

    expect(
      await failureOf(api.calculateHouseholdImpact(householdRequest, reform)),
    ).toMatchObject({
      message: expect.stringMatching(/shares a limit on calculations a minute/i),
      rateLimited: true,
    });
    expect(requests).toEqual([]);
  });

  it("holds back a calculation whose wait for the limit ends during a pause", async () => {
    // Nine years need 18 calculations: 15 start at once, and the other
    // three wait a minute for the limit. A refusal pauses calculations in
    // the meantime.
    vi.useFakeTimers();
    const years = [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];
    const recordedRequests = stubFetch(
      () => new Promise<Response>(() => undefined),
    );
    const outcomes = Promise.allSettled(
      years.map((year) =>
        api.calculateHouseholdImpact({ ...householdRequest, year }, reform),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(recordedRequests).toHaveLength(15);

    await vi.advanceTimersByTimeAsync(10_000);
    pauseHouseholdCalculations(120_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(recordedRequests).toHaveLength(15);
    pauseHouseholdCalculations(0);
    void outcomes;
  });

  it("says a calculation held back during a pause may have met the limit", async () => {
    // The pause may have started from a request with no answer, which
    // only may have met the limit.
    stubFetch(() => okAnswer(calculatedHousehold([0], [0], [0], [0])));
    pauseHouseholdCalculations();

    expect(
      await failureOf(api.calculateHouseholdImpact(householdRequest, reform)),
    ).toMatchObject({
      message:
        "Everyone on your network, such as a workshop or an office, shares " +
        "a limit on calculations a minute, which may have been reached.",
      rateLimited: true,
    });
  });

  it("pauses household calculations when either calculation of a year is refused", async () => {
    // Current law fails at once for another reason; the firewall refuses
    // the reform a moment later, after the year has already failed.
    stubFetch(async (request) => {
      const body = request.body as { policy?: unknown };
      if (body.policy === undefined) {
        return jsonResponse(500, {
          status: "error",
          message: "Internal error",
          result: null,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response("Too Many Requests", {
        status: 429,
        headers: { "Content-Type": "text/plain" },
      });
    });

    expect(
      await failureOf(api.calculateHouseholdImpact(householdRequest, reform)),
    ).toMatchObject({ status: 500 });
    await vi.waitFor(() =>
      expect(householdCalculationPauseRemaining()).toBeGreaterThan(0),
    );
  });

  it("sends the baseline and reform households to the dashboard API", async () => {
    const recordedRequests = stubFetch(() =>
      okAnswer(calculatedHousehold([0, 100000], [0, 90000], [0, 9000], [0, 4000])),
    );

    await api.calculateHouseholdImpact(householdRequest, reform);

    const household = buildHouseholdSituation(householdRequest);
    expect(recordedRequests).toEqual([
      {
        url: `${DASHBOARD_API}/household/calculate`,
        method: "POST",
        body: { country: "us", household },
      },
      {
        url: `${DASHBOARD_API}/household/calculate`,
        method: "POST",
        body: { country: "us", household, policy: reform },
      },
    ]);
  });

  it("sends current law twice when the reform changes nothing", async () => {
    const recordedRequests = stubFetch(() =>
      okAnswer(calculatedHousehold([0, 100000], [0, 90000], [0, 9000], [0, 4000])),
    );

    await api.calculateHouseholdImpact(householdRequest, {});

    const household = buildHouseholdSituation(householdRequest);
    expect(recordedRequests.map((request) => request.body)).toEqual([
      { country: "us", household },
      { country: "us", household },
    ]);
  });

  it("reads net income and both income taxes as before", async () => {
    const incomes = [0, 50000, 100000];
    stubFetch((request) =>
      okAnswer(
        (request.body as { policy?: unknown }).policy === undefined
          ? // Current law.
            calculatedHousehold(
              incomes,
              [10, 40000, 70000],
              [0, 3000, 9000],
              [0, 2000, 5000],
            )
          : // The reform.
            calculatedHousehold(
              incomes,
              [110, 40500, 70200],
              [0, 3000, 9100],
              [0, 1500, 4600],
            ),
      ),
    );

    const impact = await api.calculateHouseholdImpact(householdRequest, reform);

    // At 75,000: net income 55,000 before and 55,350 after; federal income
    // tax 6,000 and 6,050; Missouri income tax 3,500 and 3,050.
    expect(impact).toEqual({
      income_range: incomes,
      net_income_change: [100, 500, 200],
      federalTaxChange: [0, 0, 100],
      stateTaxChange: [0, -500, -400],
      netIncomeChange: [100, 500, 200],
      benefit_at_income: {
        baseline: 55000,
        reform: 55350,
        difference: 350,
        federal_tax_change: 50,
        state_tax_change: -450,
        net_income_change: 350,
      },
      x_axis_max: 400000,
    });
  });

  it("explains the shared limit after the firewall's rate limit", async () => {
    stubFetch(
      () =>
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    expect(
      await failureOf(api.calculateHouseholdImpact(householdRequest, reform)),
    ).toMatchObject({
      // The countdown beside "Done" says when the page can calculate
      // again, so the message stays true after the minute.
      message:
        "Everyone on your network, such as a workshop or an office, shares " +
        "a limit on calculations a minute, and it has been reached.",
      status: 429,
      rateLimited: true,
    });
  });

  it("asks the user to wait when no answer could be read", async () => {
    // A page on another origin cannot read the firewall's 429, which has no
    // CORS headers: the browser reports a network failure instead.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    expect(
      await failureOf(api.calculateHouseholdImpact(householdRequest, reform)),
    ).toMatchObject({
      message:
        "PolicyEngine's calculation service could not be reached. Everyone " +
        "on your network, such as a workshop or an office, shares a limit " +
        "on calculations a minute, which may have been reached.",
      status: null,
      rateLimited: true,
    });
  });

  it("reports a network failure on www.policyengine.org without pausing", async () => {
    // There the page and the dashboard API share an origin, so the
    // firewall's 429 is readable: no answer means a network failure.
    vi.stubGlobal("location", { origin: "https://www.policyengine.org" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    expect(
      await failureOf(api.calculateHouseholdImpact(householdRequest, reform)),
    ).toMatchObject({
      message:
        "PolicyEngine's calculation service could not be reached. Check " +
        "your connection and try again.",
      status: null,
      rateLimited: false,
    });
    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it("shows the server's message and status for other failures", async () => {
    stubFetch(() =>
      jsonResponse(400, {
        status: "error",
        message: "Unknown fields: households.",
        result: null,
      }),
    );

    expect(
      await failureOf(api.calculateHouseholdImpact(householdRequest, reform)),
    ).toMatchObject({
      message: expect.stringMatching(/HTTP 400.*Unknown fields: households\./),
      status: 400,
    });
  });

  it("retries a brief gateway failure once after two seconds", async () => {
    vi.useFakeTimers();
    let calculations = 0;
    const recordedRequests = stubFetch(() => {
      calculations += 1;
      return calculations === 1
        ? jsonResponse(502, {
            status: "error",
            message: "The Public API could not be reached.",
            result: null,
          })
        : okAnswer(
            calculatedHousehold([0, 100000], [0, 90000], [0, 9000], [0, 4000]),
          );
    });

    const impact = api.calculateHouseholdImpact(householdRequest, reform);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(impact).resolves.toMatchObject({ x_axis_max: 400000 });
    expect(recordedRequests).toHaveLength(3);
  });

  it("shows a 504 without sending the calculation again", async () => {
    // A 504 means the dashboard API has already waited 750 seconds for the
    // household (the policyengine-api-access skill's errors table).
    vi.useFakeTimers();
    const recordedRequests = stubFetch(() =>
      jsonResponse(504, {
        status: "error",
        message: "The Public API did not answer in time.",
        result: null,
      }),
    );

    const failure = failureOf(api.calculateHouseholdImpact(householdRequest, reform));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await failure).toMatchObject({
      message:
        "PolicyEngine's calculation service did not answer in time (HTTP " +
        "504). Try again in a few minutes.",
      status: 504,
    });
    // Two calculations, each sent once.
    expect(recordedRequests).toHaveLength(2);
  });

  it("waits for Retry-After before the retry when it asks for more than two seconds", async () => {
    vi.useFakeTimers();
    let calculations = 0;
    const recordedRequests = stubFetch(() => {
      calculations += 1;
      return calculations === 1
        ? new Response(
            JSON.stringify({
              status: "error",
              message: "Authentication is unavailable",
              result: null,
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json", "Retry-After": "10" },
            },
          )
        : okAnswer(
            calculatedHousehold([0, 100000], [0, 90000], [0, 9000], [0, 4000]),
          );
    });

    const impact = api.calculateHouseholdImpact(householdRequest, reform);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(recordedRequests).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1);
    await expect(impact).resolves.toMatchObject({ x_axis_max: 400000 });
    expect(recordedRequests).toHaveLength(3);
  });

  it("shows a gateway failure at once when Retry-After asks for more than a minute", async () => {
    vi.useFakeTimers();
    const recordedRequests = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            status: "error",
            message: "The Public API could not be reached.",
            result: null,
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json", "Retry-After": "120" },
          },
        ),
    );

    const failure = failureOf(api.calculateHouseholdImpact(householdRequest, reform));
    await vi.advanceTimersByTimeAsync(130_000);

    expect(await failure).toMatchObject({
      message: expect.stringMatching(/HTTP 502.*could not be reached/),
      status: 502,
    });
    // Two calculations, each sent once.
    expect(recordedRequests).toHaveLength(2);
  });

  it("counts a retry toward the 15 household calculations a minute", async () => {
    // Seven years need 14 calculations. Each fails once with a 502; after
    // two seconds only one retry fits in the minute, and the other 13 wait
    // until the first calculations are a minute old.
    vi.useFakeTimers();
    const years = [2027, 2028, 2029, 2030, 2031, 2032, 2033];
    const forEveryYear = (values: number[]) =>
      Object.fromEntries(years.map((year) => [String(year), values]));
    let calculations = 0;
    const recordedRequests = stubFetch(() => {
      calculations += 1;
      return calculations <= years.length * 2
        ? jsonResponse(502, {
            status: "error",
            message: "The Public API could not be reached.",
            result: null,
          })
        : okAnswer({
            people: { you: { employment_income: forEveryYear([0, 100000]) } },
            tax_units: {
              "your tax unit": {
                income_tax: forEveryYear([0, 9000]),
                mo_income_tax: forEveryYear([0, 4000]),
              },
            },
            households: {
              "your household": { household_net_income: forEveryYear([0, 90000]) },
            },
          });
    });

    const impacts = years.map((year) =>
      api.calculateHouseholdImpact({ ...householdRequest, year }, reform),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(recordedRequests).toHaveLength(14);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(recordedRequests).toHaveLength(15);

    await vi.advanceTimersByTimeAsync(57_999);
    expect(recordedRequests).toHaveLength(15);

    await vi.advanceTimersByTimeAsync(1);
    expect(recordedRequests).toHaveLength(28);
    await Promise.all(impacts);
  });

  it("sends at most 15 household calculations in any minute", async () => {
    // Half of the dashboard API's limit of 30 a minute, as the
    // policyengine-api-access skill asks; one "Done" needs up to 18.
    vi.useFakeTimers();
    const years = [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];
    const forEveryYear = (values: number[]) =>
      Object.fromEntries(years.map((year) => [String(year), values]));
    const recordedRequests = stubFetch(() =>
      okAnswer({
        people: { you: { employment_income: forEveryYear([0, 100000]) } },
        tax_units: {
          "your tax unit": {
            income_tax: forEveryYear([0, 9000]),
            mo_income_tax: forEveryYear([0, 4000]),
          },
        },
        households: {
          "your household": { household_net_income: forEveryYear([0, 90000]) },
        },
      }),
    );

    const impacts = years.map(
      (year) => api.calculateHouseholdImpact({ ...householdRequest, year }, reform),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(recordedRequests).toHaveLength(15);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(recordedRequests).toHaveLength(18);
    await Promise.all(impacts);
  });

  it("does not count time waiting for the limit toward the 13 minutes", async () => {
    // Nine years need 18 calculations, and each takes the Public API 770
    // seconds. The last three wait a minute for the 15-a-minute limit, so
    // they answer 830 seconds after the first calculations were sent.
    vi.useFakeTimers();
    const years = [2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];
    const forEveryYear = (values: number[]) =>
      Object.fromEntries(years.map((year) => [String(year), values]));
    stubFetch(
      (_request, init) =>
        new Promise<Response>((resolve, reject) => {
          const answer = setTimeout(
            () =>
              resolve(
                okAnswer({
                  people: { you: { employment_income: forEveryYear([0, 100000]) } },
                  tax_units: {
                    "your tax unit": {
                      income_tax: forEveryYear([0, 9000]),
                      mo_income_tax: forEveryYear([0, 4000]),
                    },
                  },
                  households: {
                    "your household": {
                      household_net_income: forEveryYear([0, 90000]),
                    },
                  },
                }),
              ),
            770_000,
          );
          init.signal?.addEventListener("abort", () => {
            clearTimeout(answer);
            reject(init.signal?.reason);
          });
        }),
    );

    const outcomes = Promise.allSettled(
      years.map((year) =>
        api.calculateHouseholdImpact({ ...householdRequest, year }, reform),
      ),
    );
    await vi.advanceTimersByTimeAsync(835_000);

    expect((await outcomes).map((outcome) => outcome.status)).toEqual(
      years.map(() => "fulfilled"),
    );
  });

  it("shows a gateway failure that keeps happening", async () => {
    vi.useFakeTimers();
    const recordedRequests = stubFetch(() =>
      jsonResponse(502, {
        status: "error",
        message: "The Public API could not be reached.",
        result: null,
      }),
    );

    const failure = failureOf(api.calculateHouseholdImpact(householdRequest, reform));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(await failure).toMatchObject({
      message: expect.stringMatching(/HTTP 502.*could not be reached/),
      status: 502,
    });
    // Two calculations, each tried twice.
    expect(recordedRequests).toHaveLength(4);
  });

  it("gives up 13 minutes after sending a calculation without an answer", async () => {
    // 30 seconds more than the dashboard API's 750-second wait for a
    // household calculation.
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init: RequestInit = {}) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );

    let failed = false;
    const failure = failureOf(api.calculateHouseholdImpact(householdRequest, reform));
    void failure.then(() => {
      failed = true;
    });
    await vi.advanceTimersByTimeAsync(779_999);
    expect(failed).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await failure).toMatchObject({
      message: "The calculation took longer than 13 minutes. Try again.",
      status: null,
      rateLimited: false,
    });
  });

  it("shows the dashboard API's 504 after its 750-second wait for the household", async () => {
    // The page waits longer than the dashboard API, so the dashboard API's
    // own 504 reaches it, and it is not sent again.
    vi.useFakeTimers();
    const recordedRequests = stubFetch(
      (_request, init) =>
        new Promise<Response>((resolve, reject) => {
          const answer = setTimeout(
            () =>
              resolve(
                jsonResponse(504, {
                  status: "error",
                  message: "The Public API did not answer in time.",
                  result: null,
                }),
              ),
            750_000,
          );
          init.signal?.addEventListener("abort", () => {
            clearTimeout(answer);
            reject(init.signal?.reason);
          });
        }),
    );

    const failure = failureOf(api.calculateHouseholdImpact(householdRequest, reform));
    await vi.advanceTimersByTimeAsync(750_000);

    expect(await failure).toMatchObject({
      message:
        "PolicyEngine's calculation service did not answer in time (HTTP " +
        "504). Try again in a few minutes.",
      status: 504,
      rateLimited: false,
    });
    expect(recordedRequests).toHaveLength(2);
  });
});

describe("createPolicy", () => {
  it("asks the user to wait a minute when storing the reform is refused", async () => {
    stubFetch(
      () =>
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    expect(await failureOf(createPolicy(reform))).toMatchObject({
      message:
        "Everyone on your network, such as a workshop or an office, shares " +
        "a limit on calculations a minute, and it has been reached. Try " +
        "again in a minute.",
      status: 429,
    });
  });

  it("stores the reform through the dashboard API and returns its ID", async () => {
    const recordedRequests = stubFetch(() => jsonResponse(201, { id: 98765 }));

    const policyId = await createPolicy(reform);

    expect(policyId).toBe(98765);
    expect(recordedRequests).toEqual([
      {
        url: `${DASHBOARD_API}/policies`,
        method: "POST",
        body: { country: "us", parameters: reform },
      },
    ]);
  });
});

describe("pollEconomicImpact", () => {
  it("polls the Missouri comparison through the dashboard API until it is ready", async () => {
    vi.useFakeTimers();
    const statewideResult = { budget: { budgetary_impact: -1_000_000 } };
    let reads = 0;
    const recordedRequests = stubFetch(() => {
      reads += 1;
      return reads === 1
        ? jsonResponse(200, { status: "computing", message: null, result: null })
        : okAnswer(statewideResult);
    });

    const comparison = pollEconomicImpact(98765, 2027);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await comparison).toEqual(statewideResult);
    const comparisonUrl =
      `${DASHBOARD_API}/economy/compare?country=us&policy=98765&baseline=2` +
      "&region=mo&year=2027";
    expect(recordedRequests.map((request) => request.url)).toEqual([
      comparisonUrl,
      comparisonUrl,
    ]);
  });

  it("shows a failed comparison's message", async () => {
    stubFetch(() =>
      jsonResponse(502, {
        status: "error",
        message: "The economy simulation failed.",
        result: null,
        retry_after_seconds: 300,
      }),
    );

    expect(await failureOf(pollEconomicImpact(98765, 2027))).toMatchObject({
      message: expect.stringContaining("The economy simulation failed."),
    });
  });

  it("asks the user to wait when a comparison read gets no answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    expect(await failureOf(pollEconomicImpact(98765, 2027))).toMatchObject({
      message: expect.stringMatching(
        // No countdown is shown for the statewide results, so the message
        // says when to try again.
        /could not be reached.*shares a limit on calculations a minute, which may have been reached\. Try again in a minute\.$/i,
      ),
    });
  });
});
