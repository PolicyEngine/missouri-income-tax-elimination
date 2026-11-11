import { afterEach, describe, expect, it, vi } from "vitest";

import { api, createPolicy, pollEconomicImpact } from "@/lib/api";
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
});

describe("calculateHouseholdImpact", () => {
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

  it("asks the user to wait after the firewall's rate limit", async () => {
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
      message: expect.stringMatching(/in the last minute.*wait a minute/i),
      status: 429,
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
      message: expect.stringMatching(/could not be reached.*wait a minute/i),
      status: null,
    });
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

  it("retries a calculation once after a gateway failure", async () => {
    // The dashboard API answers 504 when the Public API takes over 100
    // seconds. The Public API still finishes and caches the result, so a
    // second request usually gets it at once.
    vi.useFakeTimers();
    let calculations = 0;
    const recordedRequests = stubFetch(() => {
      calculations += 1;
      return calculations === 1
        ? jsonResponse(504, {
            status: "error",
            message: "The Public API did not answer in time.",
            result: null,
          })
        : okAnswer(
            calculatedHousehold([0, 100000], [0, 90000], [0, 9000], [0, 4000]),
          );
    });

    const impact = api.calculateHouseholdImpact(householdRequest, reform);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(impact).resolves.toMatchObject({ x_axis_max: 400000 });
    expect(recordedRequests).toHaveLength(3);
  });

  it("shows a gateway failure that happens again", async () => {
    vi.useFakeTimers();
    const recordedRequests = stubFetch(() =>
      jsonResponse(504, {
        status: "error",
        message: "The Public API did not answer in time.",
        result: null,
      }),
    );

    const failure = failureOf(api.calculateHouseholdImpact(householdRequest, reform));
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await failure).toMatchObject({
      message: expect.stringMatching(/HTTP 504.*did not answer in time/),
      status: 504,
    });
    // Two calculations, each tried twice.
    expect(recordedRequests).toHaveLength(4);
  });

  it("gives up after five minutes without an answer", async () => {
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

    const failure = failureOf(api.calculateHouseholdImpact(householdRequest, reform));
    await vi.advanceTimersByTimeAsync(300_000);

    expect(await failure).toMatchObject({
      message: expect.stringMatching(/five minutes/i),
      status: null,
    });
  });
});

describe("createPolicy", () => {
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
      message: expect.stringMatching(/could not be reached.*wait a minute/i),
    });
  });
});
