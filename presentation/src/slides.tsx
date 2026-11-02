import { Slide, Fragment, CodeStepper, DiagramStepper } from '@react-slides/core'
import { useShikiHighlighter } from '@react-slides/plugin-shiki'
import { regionFadeIn } from '@react-slides/plugin-motion'

import { BrandMark, Browser, Frame, Pill, asset, type Status } from './ui'
import { ArchitectureDiagram, IntervalDiagram, OwnershipDiagram, SequenceDiagram, StateDiagram } from './diagrams'

/* Both parts (A and C) must report against the same commit/tag. Update both lines when the tag exists. */
const ASSESSED_BASELINE = 'f200832'
const REPORTING_BASELINE = 'měřeno na 046bc8c · tag po merge do main'
const TEAM = 'swi-proj · IND0040, PRO0458, KOL0603, MER0126'

/* Faithful excerpts of src/lib/reservation-policy.ts (messages shortened). */
const PLAN_DECISION_CODE = `export function planDecision(
  reservation: { status: ReservationStatus; startTime: Date },
  decision: "APPROVE" | "REJECT",
  now: Date,
): DecisionPlan {
  if (reservation.status !== "PENDING_APPROVAL") {
    throw new ReservationRuleViolation("INVALID_STATE", "…");
  }
  if (now >= reservation.startTime) return "EXPIRE";
  return decision === "REJECT" ? "REJECT" : "CONFIRM_CHECKS";
}`

const ASSERT_CAN_CONFIRM_CODE = `export function assertCanConfirm(
  agentIsActive: boolean,
  hasConfirmedOverlap: boolean,
): void {
  if (!agentIsActive) {
    throw new ReservationRuleViolation("AGENT_INACTIVE", "…");
  }
  if (hasConfirmedOverlap) {
    throw new ReservationRuleViolation("AGENT_UNAVAILABLE", "…");
  }
}`

type Verdict = 'YES' | 'PARTLY' | 'NO'

const VERDICT_PILL: Record<Verdict, Status> = { YES: 'CONFIRMED', PARTLY: 'PENDING_APPROVAL', NO: 'REJECTED' }

function V({ v }: { v: Verdict }) {
  return <Pill status={VERDICT_PILL[v]}>{v}</Pill>
}

/* docs/review.md: C06 assessment by team Parking reservation system, 2026-10-24. */
const REVIEW_SCORECARD: [string, [string, Verdict][]][] = [
  ['Baseline', [['B1', 'PARTLY'], ['B2', 'YES']]],
  ['C02 Specifikace', [['R1', 'YES'], ['R2', 'YES'], ['R3', 'YES'], ['R4', 'PARTLY'], ['R5', 'YES']]],
  ['C03 Architektura', [['A1', 'YES'], ['A2', 'YES'], ['A3', 'YES'], ['A4', 'YES']]],
  ['C04 Kvalita', [['Q1', 'NO'], ['Q2', 'NO'], ['Q3', 'NO']]],
  ['C05 Detailní návrh', [['D1', 'YES'], ['D2', 'YES'], ['D3', 'YES'], ['D4', 'YES'], ['D5', 'YES']]],
]

/* Slide C·02: Specified / Designed / Implemented / Verified with the evidence or the gap. */
const DELIVERY: [string, Verdict, Verdict, Verdict, Verdict, string][] = [
  ['OP-01 Create', 'YES', 'YES', 'YES', 'YES', 'C05 DD · test:c02 OP-01'],
  ['OP-02 Availability', 'YES', 'YES', 'YES', 'YES', 'test:c02 half-open hranice'],
  ['OP-03/05 Confirm · Approval', 'YES', 'YES', 'YES', 'YES', 'C05 §6 · test:c02 OP-05, REQ-10'],
  ['OP-04 Cancel', 'YES', 'YES', 'YES', 'YES', 'planCancel · test:c05 + test:c02'],
  ['Business rules BR-01…06', 'YES', 'YES', 'YES', 'YES', 'test:c05 · BR-04 pod souběhem QC-03'],
  ['C04 · integrita pod souběhem', 'YES', 'YES', 'YES', 'YES', 'QC-01…04 PASS, K = 10 × 5'],
]

const RISKS: {
  id: string
  category: string
  statement: string
  initial: string
  priority: Status
  response: string
  expected: string
  actual: string
  trigger: string
}[] = [
  {
    id: 'R-01',
    category: 'Technical / Quality',
    statement: 'BR-02 a BR-04 drží jen díky serializaci SQLite → chyba pod vyšším souběhem by zůstala neodhalena → double booking',
    initial: 'L2 × I3 = HIGH 6',
    priority: 'REJECTED',
    response: 'MITIGATE · QC-01 (K = 10 × 5), QC-03, QC-04 v test:c02 a CI',
    expected: 'L1 × I3 = MEDIUM 3',
    actual: 'MEDIUM 3 · ověřeno 2026-11-02',
    trigger: 'kterékoli QC = FAIL · více procesů / jiná DB',
  },
  {
    id: 'R-02',
    category: 'Release / Baseline',
    statement: 'Část A a C mohou ukázat jiný stav, protože reporting tag zatím neexistuje → nekonzistentní obhajoba (C06 F2)',
    initial: 'L2 × I2 = MEDIUM 4',
    priority: 'PENDING_APPROVAL',
    response: 'MITIGATE · tag na main po merge, všechny checks na tagu',
    expected: 'L1 × I1 = LOW 1',
    actual: 'NOT VERIFIED',
    trigger: 'commit do main po vytvoření tagu',
  },
  {
    id: 'R-03',
    category: 'Security',
    statement: 'Login throttle žije v paměti procesu → restart jej vynuluje a cizí e-mail lze dočasně zablokovat',
    initial: 'L2 × I1 = LOW 2',
    priority: 'CONFIRMED',
    response: 'ACCEPT · v souladu s ADR-001 (jeden proces)',
    expected: 'L2 × I1 = LOW 2',
    actual: 'LOW 2 · přijato',
    trigger: 'nasazení s více procesy',
  },
]

/* Slide C·05: action, owner, due, Definition of Done, related finding/risk. */
const ACTIONS: [string, string, string, string, string][] = [
  ['Merge c07-c08-presentation do main', 'IND0040', 'před C08', 'main obsahuje C04, QC testy a schválení', 'F1 · F3'],
  ['Vytvořit reporting tag a spustit všechny checks na něm', 'IND0040', 'před C08', 'tag + tabulka výsledků v evidence', 'F2 · R-02'],
  ['Zapsat risk register (část B) do evidence', 'KOL0603', 'před C08', '≥ 4 rizika z ≥ 3 kategorií v evidence-and-evolution.md', 'B'],
  ['Zapsat disposition C06 F1–F3 do evidence', 'KOL0603', 'před C08', 'claim, verify, decision, closure pro F1–F3', 'F1–F3'],
]

export default function TechnicalDesignReview() {
  const Highlighter = useShikiHighlighter({ theme: 'github-light-default', langs: ['typescript'] })

  return (
    <>
      {/* ---------------------------------------------------------- */}
      {/* A · Technical Design Review                                */}
      {/* ---------------------------------------------------------- */}

      <Slide notes="Část A, 8–10 minut. Jedna technická linie od pravidla BR-02 až po nález z C06. C06 hodnotilo commit f200832; aktuální stav ukazuje reporting baseline v části C.">
        <Frame>
          <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 80, alignItems: 'center', flex: 1 }}>
            <div>
              <div className="row" style={{ marginBottom: 40 }}>
                <BrandMark />
              </div>
              <h1>
                Agent
                <br />
                Reservations
              </h1>
              <p className="lede" style={{ fontSize: 36, color: 'var(--ink-2)', marginTop: 36 }}>
                Technical design review: jedno pravidlo od specifikace až po review.
              </p>
              <div className="row" style={{ marginTop: 44, gap: 12, flexWrap: 'wrap' }}>
                <Pill status="CONFIRMED" />
                <Pill status="PENDING_APPROVAL" />
                <Pill status="REJECTED" />
                <Pill status="CANCELLED" />
                <Pill status="EXPIRED" />
              </div>
              <p className="mono muted" style={{ fontSize: 22, marginTop: 56 }}>
                {TEAM}
              </p>
            </div>
            <Browser src={asset('screenshots/home-public.png')} alt="Veřejný přehled rezervací" scrollTo={0.44} crop={{ x: 0.1, w: 0.8 }} style={{ height: 620 }} />
          </div>
        </Frame>
      </Slide>

      <Slide steps={5} notes="Mapa celé obhajoby. Každý krok odpovídá jednomu kroku zadání a pracuje se stejným pravidlem BR-02: dva CONFIRMED intervaly stejného agenta se nesmí překrývat.">
        <Frame title="Jedna argumentační linie: BR-02." lede="Dvě CONFIRMED rezervace stejného Agenta se nikdy nepřekrývají — ani pod souběhem.">
          <div className="body" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24, alignContent: 'center' }}>
            {[
              ['1 · SCOPE', 'OP-01 Create', 'Pre/postconditions, BR-02, změna v0.2 se schvalováním.'],
              ['2 · ARCHITECTURE', 'Jeden vlastník', 'Reservation Service drží rozhodnutí i transakci. ADR-001.'],
              ['3 · DETAILED DESIGN', 'Čistá policy', 'planDecision + assertCanConfirm, větve a failure kódy.'],
              ['4 · EVIDENCE', 'Test + C04', 'Pozitivní, hraniční a souběžný případ. Kritérium QC-01.'],
              ['5 · C06', 'Nález F1', 'Chybělo C04. Ověřeno, přijato, uzavřeno měřením.'],
            ].map(([tag, h, p], i) => (
              <Fragment key={tag} step={i + 1} className="card">
                <span className="tag" style={{ color: 'var(--confirmed)' }}>
                  {tag}
                </span>
                <h3>{h}</h3>
                <p>{p}</p>
              </Fragment>
            ))}
          </div>
        </Frame>
      </Slide>

      {/* ---------- 1 · Scope & accepted behavior ---------- */}

      <Slide notes="Doména: exkluzivní Resource je AI Agent, přiděluje se podle času. Dvě role. Hranice systému: jedna Next.js aplikace a SQLite; žádná notifikační služba ani externí identita. Vybraná operace je OP-01 Create.">
        <Frame title="Scope: kdo, co a kde končí systém." section="A1 · Scope">
          <div className="body" style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: 56, alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 26 }}>
              <div className="card">
                <span className="tag">DOMÉNA</span>
                <p>Exkluzivní Resource = AI Agent. Přiděluje se podle času: interval <code>[start, end)</code> patří celý jednomu Userovi.</p>
              </div>
              <div className="card">
                <span className="tag">ROLE · AR-01</span>
                <p>
                  <b style={{ color: 'var(--ink)' }}>User</b> vytváří a ruší vlastní Reservation. <b style={{ color: 'var(--ink)' }}>Admin</b> schvaluje / zamítá (OP-05).
                </p>
              </div>
              <div className="card">
                <span className="tag">HRANICE SYSTÉMU</span>
                <p>Jeden proces Next.js + SQLite. Mimo: prohlížeč. Notifikace ani externí identita nejsou součástí přijaté specifikace.</p>
              </div>
            </div>
            <div>
              <Browser src={asset('screenshots/home-user.png')} alt="Pohled přihlášeného uživatele" scrollTo={0.185} style={{ height: 520 }} />
              <div className="row" style={{ marginTop: 28, gap: 12, flexWrap: 'wrap' }}>
                <Pill status="CONFIRMED">OP-01 Create · vybráno</Pill>
                <Pill status="ghost">OP-02 Availability</Pill>
                <Pill status="ghost">OP-03 Confirm</Pill>
                <Pill status="ghost">OP-04 Cancel</Pill>
                <Pill status="ghost">OP-05 Approve (v0.2)</Pill>
              </div>
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide steps={2} notes="Karta OP-01 ze specifikace v0.2.1. Confirm není samostatný krok: je to atomický commit uvnitř Create. Verification example: navazující interval projde, překryv je odmítnut 409 a nic se neuloží.">
        <Frame title="OP-01 Create a invariant BR-02." section="A1 · Scope">
          <div className="body" style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 48 }}>
            <div className="card" style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
              <div>
                <span className="tag">PRECONDITIONS</span>
                <ul className="clean small">
                  <li>přihlášený User · aktivní Agent (BR-05)</li>
                  <li>
                    <code>start &lt; end</code>, offset / <code>Z</code> (BR-01), <code>start &gt; now</code> (BR-06)
                  </li>
                  <li>žádný překrývající se CONFIRMED (BR-02) · limit N (BR-04)</li>
                </ul>
              </div>
              <div>
                <span className="tag">POSTCONDITIONS</span>
                <ul className="clean small">
                  <li>
                    právě jedna Reservation: <Pill status="CONFIRMED" />, u Agenta se schválením <Pill status="PENDING_APPROVAL" />
                  </li>
                  <li>odpověď vrací id a stav · BR-02 platí dál</li>
                </ul>
              </div>
              <div>
                <span className="tag">FAILURE</span>
                <ul className="clean small red">
                  <li>400 interval / START_IN_PAST · 404 Agent · 403 QUOTA_EXCEEDED · 409 AGENT_UNAVAILABLE → nic se neuloží</li>
                </ul>
              </div>
              <p className="mono muted" style={{ fontSize: 18 }}>
                docs/c02/operations/op-01-create-reservation.md
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 18 }}>
              <div className="card" style={{ padding: '24px 30px' }}>
                <span className="tag" style={{ marginBottom: 8 }}>
                  BR-02 · VERIFICATION EXAMPLE
                </span>
                <p className="mono" style={{ fontSize: 21, color: 'var(--ink)' }}>
                  překryv ⇔ existing.start &lt; requested.end ∧ existing.end &gt; requested.start
                </p>
              </div>
              <DiagramStepper animation={regionFadeIn} steps={[{ show: ['touch'] }, { show: ['overlap'] }]}>
                <IntervalDiagram />
              </DiagramStepper>
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide steps={4} notes="Povinná změna C02 v0.2: Agent s requiresApproval vytváří PENDING_APPROVAL. Schválení je druhá cesta do CONFIRMED, a proto musí BR-02 znovu ověřit. PENDING neblokuje dostupnost, ale počítá se do limitu BR-04.">
        <Frame title="Změna v0.2: druhá cesta do CONFIRMED vede přes Admina." section="A1 · Scope">
          <div className="body" style={{ display: 'flex', alignItems: 'center' }}>
            <DiagramStepper
              animation={regionFadeIn}
              steps={[{ show: ['instant'] }, { show: ['cancel'] }, { show: ['pending'] }, { show: ['endings'] }]}
            >
              <StateDiagram />
            </DiagramStepper>
          </div>
        </Frame>
      </Slide>

      {/* ---------- 2 · Architecture ---------- */}

      <Slide notes="Driver je problém, ne řešení: souběžné požadavky a odložené schválení musí dojít k jedinému autoritativnímu rozhodnutí. AS-IS nález: šest Route Handlers zapisovalo stav. Tabulka ukazuje, kdo co po C03 a C05 vlastní.">
        <Frame title="Driver a vlastníci odpovědností." section="A2 · Architecture">
          <div className="body" style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: 56, alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 26 }}>
              <div className="card" style={{ borderColor: 'var(--confirmed)', borderWidth: 3 }}>
                <span className="tag" style={{ color: 'var(--confirmed)' }}>
                  DRIVER · BR-02 · REQ-07 · REQ-10
                </span>
                <p style={{ color: 'var(--ink-2)' }}>Oddělené požadavky vidí stejný volný termín. Create i pozdější Approve musí skončit jediným autoritativním „ano“.</p>
              </div>
              <div className="card">
                <span className="tag" style={{ color: 'var(--rejected)' }}>
                  AS-IS NÁLEZ (C03 ČÁST A)
                </span>
                <p>Šest Route Handlers zapisovalo stav Reservation, výraz překryvu existoval třikrát.</p>
              </div>
            </div>
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>Odpovědnost</th>
                  <th>Vlastník</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Lifecycle, BR-02 rozhodnutí, transakce, expirace', 'Reservation Service'],
                  ['Pravidla jako čisté funkce (C05)', 'Reservation Policy'],
                  ['Session, role, AR-01', 'Session & Auth'],
                  ['HTTP vstup / výstup, kód → status', 'Route Handlers'],
                  ['Ukládání, serializace zápisů', 'Prisma + SQLite'],
                ].map(([r, o], i) => (
                  <tr key={r} className={i === 0 ? 'hl' : undefined}>
                    <td>{r}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {o}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Frame>
      </Slide>

      <Slide steps={3} notes="Obě alternativy jsme prošli stejným scénářem: čekající žádost, mezitím vznikne překryv, Admin schvaluje. B je korektní jen s výhradně vlastněnou DB a přidává síťové chyby, pro které nemáme driver. ADR-001 volí A a pojmenovává, kdy rozhodnutí přehodnotit.">
        <Frame title="Alternativy a ADR-001." section="A2 · Architecture">
          <div className="body grid cols-2" style={{ gap: 40, alignContent: 'center' }}>
            <Fragment step={1} className="card" style={{ position: 'relative' }}>
              <span className="tag">ALTERNATIVA A</span>
              <Fragment step={3} style={{ position: 'absolute', top: 30, right: 32 }}>
                <Pill status="CONFIRMED">ZVOLENO · ADR-001</Pill>
              </Fragment>
              <h3>Reservation Service v modulárním monolitu</h3>
              <p className="mono" style={{ fontSize: 22, margin: '18px 0', color: 'var(--ink-2)' }}>
                API adaptéry → Reservation Service → SQLite
              </p>
              <ul className="clean small">
                <li>Kontrola i zápis v jedné lokální transakci</li>
                <li>Žádná další služba, síťové volání ani retry politika</li>
                <li>Přehodnotit při více procesech nebo jiné DB</li>
              </ul>
            </Fragment>
            <Fragment step={2} className="card">
              <span className="tag">ALTERNATIVA B</span>
              <h3>Samostatná Reservation Decision Service</h3>
              <p className="mono" style={{ fontSize: 22, margin: '18px 0', color: 'var(--ink-2)' }}>
                Next.js —HTTP→ Decision Service → vlastní DB
              </p>
              <ul className="clean small red">
                <li>Korektní jen s výhradně vlastněnou DB</li>
                <li>Volající musí odlišit konflikt od výpadku sítě</li>
                <li>Identita mezi službami, nasazení, verzování</li>
              </ul>
            </Fragment>
          </div>
        </Frame>
      </Slide>

      <Slide steps={6} notes="Statický pohled po krocích. Poslední krok: zakázaná hrana. Adaptéry nesmí zapisovat stav Reservation; npm run test:architecture to hlídá a byl ověřen i negativně.">
        <Frame title="Statický pohled: tenké adaptéry, jeden vlastník." section="A2 · Architecture">
          <div className="body" style={{ display: 'flex', alignItems: 'center' }}>
            <DiagramStepper
              animation={regionFadeIn}
              steps={[
                { show: ['ui'] },
                { show: ['api'] },
                { show: ['auth', 'rms'], highlight: ['rms'] },
                { show: ['policy'] },
                { show: ['persist'] },
                { show: ['forbidden'], highlight: ['forbidden'] },
              ]}
            >
              <ArchitectureDiagram />
            </DiagramStepper>
          </div>
        </Frame>
      </Slide>

      <Slide steps={2} notes="AS-IS → TO-BE. Vlevo stav před C03, vpravo po C03 a C05: každá cesta vede přes jednu službu, překryv má jednu definici.">
        <Frame title="AS-IS → TO-BE: od šesti zapisovatelů k jednomu." section="A2 · Architecture">
          <div className="body" style={{ display: 'flex', alignItems: 'center' }}>
            <DiagramStepper animation={regionFadeIn} steps={[{ show: ['tobe'] }, { show: ['svc'], highlight: ['svc'] }]}>
              <OwnershipDiagram />
            </DiagramStepper>
          </div>
        </Frame>
      </Slide>

      <Slide steps={3} notes="Dynamický pohled odpovídá skutečné cestě v kódu: decision/route.ts ověří Admina a volá decideReservation. Uvnitř jedné transakce se znovu načte překryv; policy vrátí AGENT_UNAVAILABLE, transakce se vrátí a adaptér vrátí 409. C06 to ověřilo jako A3: YES.">
        <Frame title="Dynamický pohled: Approve s konfliktem vzniklým během čekání." section="A2 · Architecture">
          <div className="body" style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 16 }}>
            <DiagramStepper animation={regionFadeIn} steps={[{ show: ['call'] }, { show: ['checks'] }, { show: ['conflict'] }]}>
              <SequenceDiagram />
            </DiagramStepper>
            <p className="mono muted" style={{ fontSize: 19 }}>
              src/app/api/reservations/[id]/decision/route.ts → src/lib/reservation-service.ts → src/lib/reservation-policy.ts
            </p>
          </div>
        </Frame>
      </Slide>

      {/* ---------- 3 · Detailed Design ---------- */}

      <Slide steps={4} notes="Jednotka z C05: reservation-policy.ts, bez importů. Projděte: špatný stav, hranice startTime (platí i pro zamítnutí), plán místo vedlejšího efektu a nakonec kontroly potvrzení v pevném pořadí.">
        <Frame title="Kontrakt jednotky: plán rozhodnutí a podmínky potvrzení." section="A3 · Detailed Design">
          <div className="body" style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.65fr', gap: 56, alignItems: 'center' }}>
            <div style={{ display: 'grid' }}>
              <Fragment step={[1, 2, 3]} className="code-panel" style={{ gridArea: '1 / 1' }}>
                <CodeStepper
                  language="typescript"
                  highlighter={Highlighter}
                  steps={[{ highlight: [6, 7, 8] }, { highlight: [9] }, { highlight: [10] }]}
                >
                  {PLAN_DECISION_CODE}
                </CodeStepper>
              </Fragment>
              <Fragment step={4} className="code-panel" style={{ gridArea: '1 / 1' }}>
                <CodeStepper
                  language="typescript"
                  highlighter={Highlighter}
                  steps={[{}, {}, {}, { highlight: [5, 6, 7, 8, 9, 10] }]}
                >
                  {ASSERT_CAN_CONFIRM_CODE}
                </CodeStepper>
              </Fragment>
            </div>
            <div style={{ display: 'grid' }}>
              {[
                ['Rozhodovat lze jen o PENDING', 'Cokoli jiného je INVALID_STATE → 409.'],
                ['Hranice: now ≥ startTime', 'Žádost vyprší — i při zamítnutí. Stejný zdroj času jako BR-03.'],
                ['Plán, ne vedlejší efekt', 'Policy vrátí, co se má stát; zápis provede service.'],
                ['Kontroly v pevném pořadí', 'Nejdřív neaktivní Agent, pak překryv BR-02 načtený v transakci.'],
              ].map(([h, p], i) => (
                <Fragment key={h} step={i + 1} exit={i + 2} style={{ gridArea: '1 / 1' }}>
                  <span className="tag" style={{ color: 'var(--confirmed)' }}>
                    VĚTEV {i + 1} / 4
                  </span>
                  <h3>{h}</h3>
                  <p className="muted" style={{ fontSize: 26, marginTop: 12 }}>
                    {p}
                  </p>
                </Fragment>
              ))}
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Každá větev z předchozího slidu má svůj test. Unit tam, kde jde o čistou funkci a hranici času; component/integration tam, kde konflikt vzniká až čtením z databáze v transakci.">
        <Frame title="Větve → testy odvozené z DD." section="A3 · Detailed Design">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
            <table className="t compact">
              <thead>
                <tr>
                  <th style={{ width: '27%' }}>Větev / hranice</th>
                  <th style={{ width: '22%' }}>Očekávaný výsledek</th>
                  <th>Test</th>
                  <th style={{ width: '11%' }}>Úroveň</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['status ≠ PENDING_APPROVAL', 'INVALID_STATE', 'decision: only PENDING_APPROVAL can be decided', 'unit'],
                  ['now = startTime (hranice)', 'EXPIRE, i pro REJECT', 'decision: at startTime pending expires regardless of decision', 'unit'],
                  ['now < startTime', 'REJECT / CONFIRM_CHECKS', 'decision: before startTime REJECT is final, APPROVE needs confirm checks', 'unit'],
                  ['neaktivní Agent + překryv', 'AGENT_INACTIVE dřív než AGENT_UNAVAILABLE', 'confirm: inactive agent and later overlap are refused; activity is checked first', 'unit'],
                  ['překryv vznikl během čekání', '409, zůstává PENDING_APPROVAL', 'OP-05 rechecks overlap that appeared while waiting', 'component'],
                ].map(([b, e, t, l]) => (
                  <tr key={t}>
                    <td>{b}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {e}
                    </td>
                    <td className="mono muted">{t}</td>
                    <td>{l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 22 }}>
              <code>scripts/c05-unit-tests.ts</code> (bez DB) · <code>scripts/c02-verification.ts</code> (HTTP + SQLite) · mapování v <code>docs/c05/detailed-design.md §10</code>
            </p>
          </div>
        </Frame>
      </Slide>

      {/* ---------- 4 · Verification & Evidence ---------- */}

      <Slide notes="Tři případy ze skutečného běhu test:c02 dne 2026-11-02 na commitu 046bc8c, čistá SQLite, next build + next start. Oracle je přesný HTTP status a stav. Ostatní kontroly jsou z běhu 2026-10-19; doménový kód (src/lib) se od té doby nezměnil, všechny checks zopakujeme na reporting tagu.">
        <Frame title="Expected vs. observed." section="A4 · Evidence">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32 }}>
            <table className="t compact">
              <thead>
                <tr>
                  <th style={{ width: '13%' }}>Typ</th>
                  <th style={{ width: '33%' }}>Případ (test:c02)</th>
                  <th style={{ width: '23%' }}>Expected (oracle)</th>
                  <th style={{ width: '20%' }}>Observed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>pozitivní</td>
                  <td className="mono">OP-01 creates a CONFIRMED Reservation without approval</td>
                  <td className="mono">201 · CONFIRMED · id</td>
                  <td className="mono">201 · CONFIRMED · id</td>
                  <td>
                    <V v="YES" />
                  </td>
                </tr>
                <tr>
                  <td>hraniční</td>
                  <td className="mono">OP-02 applies half-open interval boundaries</td>
                  <td className="mono">[9,10) AVAILABLE · [8:30,9:30) UNAVAILABLE</td>
                  <td className="mono">AVAILABLE · UNAVAILABLE</td>
                  <td>
                    <V v="YES" />
                  </td>
                </tr>
                <tr>
                  <td>negativní · souběh</td>
                  <td className="mono">OP-03 allows at most one concurrent conflicting Create</td>
                  <td className="mono">statuses = [201, 409]</td>
                  <td className="mono">[201, 409]</td>
                  <td>
                    <V v="YES" />
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
              <Pill status="CONFIRMED">test:c02 · 34/34 · 2026-11-02</Pill>
              <Pill status="CONFIRMED">test:c05 · 20/20</Pill>
              <Pill status="CONFIRMED">test:architecture · PASS</Pill>
              <Pill status="CONFIRMED">lint · typecheck · build · PASS</Pill>
              <span className="muted" style={{ fontSize: 21 }}>
                <code>046bc8c</code>, čistá SQLite, <code>next build</code> + <code>next start</code> · ostatní 2026-10-19
              </span>
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide notes="C04: concern je integrita pod souběhem. Kritérium je PASS/FAIL, jedno porušení = FAIL. Měřeno 2026-11-02: 10 souběžných požadavků v pěti opakováních, Create i limit BR-04, plus kontrola celé DB. Vše PASS, proto ponecháváme ADR-001 beze změny kódu.">
        <Frame title="C04: co znamená quality criterion." section="A4 · Evidence">
          <div className="body" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 48, alignItems: 'center' }}>
            <table className="t compact">
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>ID</th>
                  <th>Criterion (oracle)</th>
                  <th style={{ width: '12%' }}>K × R</th>
                  <th style={{ width: '16%' }}>Výsledek</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">QC-01</td>
                  <td>10 souběžných Create na stejný interval → právě 1× 201, 9× 409, 0× 5xx</td>
                  <td className="mono">10 × 5</td>
                  <td>
                    <Pill status="CONFIRMED">PASS</Pill>
                  </td>
                </tr>
                <tr>
                  <td className="mono">QC-02</td>
                  <td>2 souběžná Approve překrývajících se žádostí → 1× 200, 1× 409</td>
                  <td className="mono">2</td>
                  <td>
                    <Pill status="CONFIRMED">PASS</Pill>
                  </td>
                </tr>
                <tr>
                  <td className="mono">QC-03</td>
                  <td>10 souběžných Create proti limitu BR-04 → právě 1× 201, 9× 403</td>
                  <td className="mono">10 × 5</td>
                  <td>
                    <Pill status="CONFIRMED">PASS</Pill>
                  </td>
                </tr>
                <tr>
                  <td className="mono">QC-04</td>
                  <td>v celé DB 0 dvojic překrývajících se CONFIRMED</td>
                  <td className="mono">–</td>
                  <td>
                    <Pill status="CONFIRMED">PASS</Pill>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: 'grid', gap: 24 }}>
              <div className="card">
                <span className="tag">PODMÍNKY MĚŘENÍ</span>
                <p>
                  2026-11-02 na <code>046bc8c</code>: <code>next build</code> + <code>next start</code>, jeden proces, čistá SQLite, <code>Promise.all</code> nad <code>fetch</code>.
                </p>
              </div>
              <div className="card" style={{ borderColor: 'var(--confirmed)', borderWidth: 3 }}>
                <span className="tag">ROZHODNUTÍ</span>
                <p style={{ color: 'var(--ink-2)' }}>Ponechat ADR-001 beze změny kódu. Při kterémkoli FAIL nebo více procesech přejít na DB constraint nebo retry.</p>
              </div>
              <p className="mono muted" style={{ fontSize: 18 }}>
                docs/c04/quality-and-measurement.md §4
              </p>
            </div>
          </div>
        </Frame>
      </Slide>

      {/* ---------- 5 · C06 Findings & Engineering Decision ---------- */}

      <Slide notes="C06 od týmu Parking reservation system, 24. 10. 2026 na f200832. 14× YES, 2× PARTLY, 3× NO. Všechna NO mají jednu příčinu: chybějící C04. Vpravo disposition všech tří nálezů.">
        <Frame title="C06: skóre a disposition nálezů." section="A5 · C06">
          <div className="body grid" style={{ gridTemplateColumns: '0.85fr 1.15fr', gap: 48, alignContent: 'center' }}>
            <div className="card" style={{ display: 'grid', gap: 20 }}>
              {REVIEW_SCORECARD.map(([area, items]) => (
                <div key={area} style={{ display: 'grid', gap: 10 }}>
                  <span style={{ fontSize: 22, fontWeight: 600 }}>{area}</span>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {items.map(([id, verdict]) => (
                      <Pill key={id} status={VERDICT_PILL[verdict]}>
                        {id} {verdict}
                      </Pill>
                    ))}
                  </div>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 20, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                14× YES · 2× PARTLY · 3× NO · commit <code>{ASSESSED_BASELINE}</code>
              </p>
            </div>
            <table className="t compact">
              <thead>
                <tr>
                  <th style={{ width: '9%' }}>ID</th>
                  <th style={{ width: '30%' }}>Ověření</th>
                  <th style={{ width: '15%' }}>Decision</th>
                  <th>Akce / closure</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hl">
                  <td className="mono">F1</td>
                  <td>VERIFIED · na f200832 neexistuje docs/c04</td>
                  <td>
                    <Pill status="CONFIRMED">ACCEPT</Pill>
                  </td>
                  <td>docs/c04 přidáno (5bc56b0) · <b>UZAVŘENO</b></td>
                </tr>
                <tr>
                  <td className="mono">F2</td>
                  <td>REJECTED CANDIDATE · více commitů = historie checkpointů</td>
                  <td>
                    <Pill status="REJECTED">REJECT</Pill>
                  </td>
                  <td>no-change · assessed = f200832, nový reporting tag</td>
                </tr>
                <tr>
                  <td className="mono">F3</td>
                  <td>VERIFIED · team-approval.md nepodepsán, v0.2.1 v kódu</td>
                  <td>
                    <Pill status="CONFIRMED">ACCEPT</Pill>
                  </td>
                  <td>
                    team-approval.md podepsán (dd85ada) · <b>UZAVŘENO</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Nejdůležitější nález: tři NO z jediné příčiny. Postup ze zadání: claim, expected, observed, verify, disposition, closure. Nález je uzavřen: docs/c04 obsahuje celý řetězec concern, kritérium, měření za deklarovaných podmínek a rozhodnutí. Měření proběhlo 2026-11-02 (10 souběžných požadavků × 5) a je součástí test:c02, takže ho CI hlídá při každé změně.">
        <Frame title="F1 · Chybí C04 Quality & Measurement." section="A5 · C06">
          <div className="body grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 36, alignContent: 'center' }}>
            <div style={{ display: 'grid', gap: 22 }}>
              {[
                ['CLAIM', 'Projekt dodává řetězec quality concern → kritérium → měření → rozhodnutí (Q1–Q3).'],
                ['EXPECTED', 'V docs/ dohledatelný C04 artefakt s měřením za deklarovaných podmínek.'],
                ['OBSERVED', 'docs/ obsahuje C02, C03, C05; README C04 neodkazuje.'],
                ['VERIFY', 'git ls-tree f200832 docs → 92 souborů, žádný c04. Reprodukováno.'],
              ].map(([t, p]) => (
                <div key={t} className="card" style={{ padding: '22px 30px' }}>
                  <span className="tag" style={{ marginBottom: 8 }}>
                    {t}
                  </span>
                  <p style={{ fontSize: 24, color: 'var(--ink-2)' }}>{p}</p>
                </div>
              ))}
            </div>
            <Fragment className="card" style={{ borderColor: 'var(--confirmed)', borderWidth: 3, display: 'grid', gap: 22, alignContent: 'start' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="tag" style={{ margin: 0 }}>
                  DISPOSITION
                </span>
                <Pill status="CONFIRMED">VERIFIED · ACCEPT</Pill>
              </div>
              <div>
                <span className="tag">CLOSURE EVIDENCE</span>
                <ul className="clean small">
                  <li>
                    commit <code>5bc56b0</code> · <code>docs/c04/quality-and-measurement.md</code>
                  </li>
                  <li>Q1 kritérium: QC-01 … QC-04 s PASS/FAIL oracle</li>
                  <li>Q2 měření: 2026-11-02, test:c02 34/34, QC-01…04 PASS (K = 10 × 5)</li>
                  <li>Q3 rozhodnutí: ponechat ADR-001 + podmínky přehodnocení</li>
                </ul>
              </div>
              <div>
                <span className="tag">REGRESE</span>
                <p>Měření je součástí test:c02, CI ho spouští při každé změně.</p>
              </div>
              <div>
                <Pill status="CONFIRMED">UZAVŘENO</Pill>
              </div>
            </Fragment>
          </div>
        </Frame>
      </Slide>

      {/* ---------------------------------------------------------- */}
      {/* C · Project Status Report                                  */}
      {/* ---------------------------------------------------------- */}

      <Slide notes="Část C, 5–7 minut. Stejný projekt, stejná reporting baseline jako část A, ale pohled řízení: stav, termíny, rizika, rozhodnutí.">
        <Frame dark section="Project Status">
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span className="tag" style={{ color: '#34d399' }}>
              ČÁST C · PROJECT STATUS REPORT
            </span>
            <h1 style={{ fontSize: 112, maxWidth: 1500 }}>Skutečný stav, ne seznam aktivit.</h1>
            <p className="lede mono" style={{ fontSize: 26 }}>
              reporting baseline · {REPORTING_BASELINE}
            </p>
          </div>
        </Frame>
      </Slide>

      <Slide notes="01 Executive Status. GREEN: všech pět operací je implementováno a ověřeno, C04 měření souběhu prošlo pro K = 10 a specifikace v0.1–v0.2.1 je schválená. Zbývá merge, reporting tag a zápis části B — žádná z těchto akcí neblokuje rozsah ani termín.">
        <Frame title="01 · Executive Status" section="Project Status">
          <div className="body" style={{ display: 'grid', gridTemplateColumns: '0.75fr 1.25fr', gap: 56, alignItems: 'center' }}>
            <div className="card" style={{ borderColor: 'var(--confirmed)', borderWidth: 4, textAlign: 'center', padding: '56px 36px' }}>
              <span className="tag">CELKOVÝ STAV</span>
              <div className="big-num em-green">GREEN</div>
              <h3 style={{ marginTop: 18 }}>ON TRACK</h3>
              <p className="mono" style={{ fontSize: 19, marginTop: 24 }}>
                {TEAM}
              </p>
            </div>
            <div style={{ display: 'grid', gap: 26 }}>
              <div className="card">
                <span className="tag">HLAVNÍ ZÁVĚR</span>
                <p style={{ color: 'var(--ink-2)' }}>
                  Všech pět operací je implementováno a ověřeno (test:c02 34/34, 2026-11-02). C04 měření souběhu prošlo pro 10 požadavků × 5 opakování a specifikace v0.1–v0.2.1 je
                  schválená.
                </p>
              </div>
              <div className="card" style={{ borderColor: 'var(--confirmed)', borderWidth: 3 }}>
                <span className="tag" style={{ color: 'var(--confirmed)' }}>
                  POTŘEBNÉ ROZHODNUTÍ
                </span>
                <p style={{ color: 'var(--ink-2)' }}>Potvrdit merge do main a reporting tag jako baseline pro obhajobu CP1. Podklad: C04 §4, team-approval.md, C06 F1–F3.</p>
              </div>
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide notes="02 Scope & Delivery. Specified YES: baseline v0.1–v0.2.1 jsou schválené v team-approval.md. Verified YES: test:c02 34/34 dne 2026-11-02 včetně BR-04 pod souběhem (QC-03) a C04 měření; unit testy test:c05 z 2026-10-19, doménový kód se od té doby nezměnil.">
        <Frame title="02 · Scope & Delivery" section="Project Status">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
            <table className="t compact">
              <thead>
                <tr>
                  <th style={{ width: '26%' }}>Položka</th>
                  <th>Specified</th>
                  <th>Designed</th>
                  <th>Implemented</th>
                  <th>Verified</th>
                  <th style={{ width: '27%' }}>Důkaz</th>
                </tr>
              </thead>
              <tbody>
                {DELIVERY.map(([item, s, d, i, v, note]) => (
                  <tr key={item}>
                    <td style={{ fontWeight: 600 }}>{item}</td>
                    <td>
                      <V v={s} />
                    </td>
                    <td>
                      <V v={d} />
                    </td>
                    <td>
                      <V v={i} />
                    </td>
                    <td>
                      <V v={v} />
                    </td>
                    <td className="muted">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 21 }}>
              Specified: <code>docs/team-approval.md</code> (v0.1–v0.2.1). Verified: <code>test:c02</code> 34/34 na <code>046bc8c</code> (2026-11-02), <code>test:c05</code> 20/20 (2026-10-19).
            </p>
          </div>
        </Frame>
      </Slide>

      <Slide notes="03 Schedule & Resources. Plán vs. skutečnost: C04 měl vzniknout v checkpointu C04, dodán až po C06 — to je skutečné zpoždění, dnes dohnané včetně měření. Schválení baseline bylo zapsáno zpětně s daty jejich commitů. Zbývající balíky dělí IND0040 a KOL0603, termín je C08.">
        <Frame title="03 · Schedule & Resources" section="Project Status">
          <div className="body" style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 48, alignItems: 'center' }}>
            <table className="t compact">
              <thead>
                <tr>
                  <th style={{ width: '36%' }}>Work package</th>
                  <th>Plán</th>
                  <th>Skutečnost / forecast</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>C04 Quality & Measurement</td>
                  <td>checkpoint C04</td>
                  <td>
                    <span className="em-red">dodáno 2026-11-02, po C06</span>
                  </td>
                  <td className="mono">IND0040</td>
                </tr>
                <tr>
                  <td>Měření QC-01 (K = 10), QC-03, QC-04</td>
                  <td>po C06</td>
                  <td className="em-green">hotovo 2026-11-02, 34/34 PASS</td>
                  <td className="mono">IND0040</td>
                </tr>
                <tr>
                  <td>Schválení v0.1 – v0.2.1</td>
                  <td>u každé baseline</td>
                  <td className="em-green">zapsáno 2026-11-02, data podle commitů</td>
                  <td className="mono">IND0040, KOL0603</td>
                </tr>
                <tr className="hl">
                  <td>Merge + reporting tag + běh všech checks</td>
                  <td>před C08</td>
                  <td>čeká na merge do main</td>
                  <td className="mono">IND0040</td>
                </tr>
                <tr>
                  <td>Risk register a C06 disposition v evidence</td>
                  <td>před C08</td>
                  <td>rizika R-01…R-03 v tomto reportu</td>
                  <td className="mono">KOL0603</td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: 'grid', gap: 24 }}>
              <div className="card">
                <span className="tag">KRITICKÁ ZÁVISLOST</span>
                <p>Reporting tag vzniká až po merge do main; obě části obhajoby se na něj odkazují.</p>
              </div>
              <div className="card">
                <span className="tag">KAPACITA</span>
                <p>Zbývající práce je rozdělená mezi IND0040 a KOL0603, každý má dvě akce.</p>
              </div>
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide notes="04 Top Risks & Issues. Tři rizika z části B se skóre L × I před ošetřením. R-01 má ověřený actual residual díky měření 2026-11-02. R-02 je NOT VERIFIED, dokud tag nevznikne. Obě issues jsou uzavřené.">
        <Frame title="04 · Top Risks & Issues" section="Project Status">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26 }}>
            <table className="t compact risk">
              <thead>
                <tr>
                  <th style={{ width: '7%' }}>ID</th>
                  <th style={{ width: '33%' }}>Příčina → událost → důsledek</th>
                  <th style={{ width: '13%' }}>Initial</th>
                  <th style={{ width: '18%' }}>Response</th>
                  <th style={{ width: '13%' }}>Expected / actual</th>
                  <th>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {RISKS.map((r) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {r.id}
                      <div className="muted" style={{ fontSize: 15, fontWeight: 400 }}>
                        {r.category}
                      </div>
                    </td>
                    <td>{r.statement}</td>
                    <td>
                      <Pill status={r.priority}>{r.initial}</Pill>
                    </td>
                    <td>{r.response}</td>
                    <td className="mono">
                      {r.expected}
                      <div className={r.actual === 'NOT VERIFIED' ? 'em-red' : 'em-green'} style={{ fontWeight: 600 }}>
                        {r.actual}
                      </div>
                    </td>
                    <td className="muted">{r.trigger}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card" style={{ padding: '22px 30px' }}>
              <span className="tag" style={{ marginBottom: 8 }}>
                ISSUES (UŽ NASTALO)
              </span>
              <p style={{ fontSize: 23 }}>
                <b style={{ color: 'var(--ink)' }}>I-1</b> specifikace nebyla podepsána (F3) → <span className="em-green">uzavřeno, team-approval.md</span> ·{' '}
                <b style={{ color: 'var(--ink)' }}>I-2</b> C04 dodáno až po C06 (F1) → <span className="em-green">uzavřeno, měření 2026-11-02</span>
              </p>
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide notes="05 Next Action Plan. Čtyři zbývající akce, každá s ownerem, termínem C08 a Definition of Done ověřitelným v repozitáři.">
        <Frame title="05 · Next Action Plan" section="Project Status">
          <div className="body" style={{ display: 'flex', alignItems: 'center' }}>
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}>#</th>
                  <th style={{ width: '34%' }}>Akce</th>
                  <th style={{ width: '12%' }}>Owner</th>
                  <th style={{ width: '11%' }}>Due</th>
                  <th>Definition of Done</th>
                  <th style={{ width: '10%' }}>Vazba</th>
                </tr>
              </thead>
              <tbody>
                {ACTIONS.map(([action, owner, due, dod, link], i) => (
                  <tr key={action}>
                    <td className="mono">{i + 1}</td>
                    <td>{action}</td>
                    <td className="mono">{owner}</td>
                    <td>{due}</td>
                    <td className="muted">{dod}</td>
                    <td className="mono">{link}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Frame>
      </Slide>

      <Slide notes="06 Decision & Outlook. Funkční rozsah, kvalitativní kritérium i schválení specifikace jsou doložené. Zbývající akce jsou administrativní a mají ownery. Forecast: GREEN do C08.">
        <Frame title="06 · Decision & Outlook" section="Project Status">
          <div className="body grid cols-2" style={{ gap: 40, alignContent: 'center' }}>
            <div className="card">
              <span className="tag" style={{ color: 'var(--confirmed)' }}>
                PROKAZATELNĚ HOTOVO
              </span>
              <ul className="clean small">
                <li>OP-01 – OP-05 implementováno, test:c02 34/34, test:c05 20/20</li>
                <li>Architektura a DD odpovídají kódu (C06: A1–A4, D1–D5 YES)</li>
                <li>C04: QC-01…04 PASS, specifikace v0.1 – v0.2.1 schválena</li>
              </ul>
            </div>
            <div className="card">
              <span className="tag" style={{ color: 'var(--rejected)' }}>
                NENÍ HOTOVO
              </span>
              <ul className="clean small red">
                <li>Merge do main a reporting tag</li>
                <li>Risk register (část B) a C06 disposition v evidence</li>
              </ul>
            </div>
            <div className="card">
              <span className="tag">NEJVĚTŠÍ OMEZENÍ</span>
              <p>Záruky souběhu platí pro jeden proces se SQLite (ADR-001); jiné nasazení vyžaduje nové rozhodnutí.</p>
            </div>
            <div className="card" style={{ borderColor: 'var(--confirmed)', borderWidth: 3 }}>
              <span className="tag" style={{ color: 'var(--confirmed)' }}>
                FORECAST · ROZHODNUTÍ
              </span>
              <p style={{ color: 'var(--ink-2)' }}>GREEN do C08. Rozhodnutí: potvrdit merge a reporting tag jako baseline CP1.</p>
            </div>
          </div>
        </Frame>
      </Slide>
    </>
  )
}
