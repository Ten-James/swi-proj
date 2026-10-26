import { Slide, Fragment, CodeStepper, DiagramStepper } from '@react-slides/core'
import { TwoColumnLayout } from '@react-slides/components'
import { useShikiHighlighter } from '@react-slides/plugin-shiki'
import { regionFadeIn } from '@react-slides/plugin-motion'

import { Browser, BrandMark, Frame, Marker, Pill, asset, type Status } from './ui'
import {
  AllocateByTimeDiagram,
  ArchitectureDiagram,
  IntervalDiagram,
  OwnershipDiagram,
  ShareByQuantityDiagram,
  StateDiagram,
} from './diagrams'

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

/* docs/review.md: C06 assessment by team Parking reservation system, 2026-10-24. */
const REVIEW_SCORECARD: [string, [string, Verdict][]][] = [
  ['Baseline', [['B1', 'PARTLY'], ['B2', 'YES']]],
  ['C02 Specifikace', [['R1', 'YES'], ['R2', 'YES'], ['R3', 'YES'], ['R4', 'PARTLY'], ['R5', 'YES']]],
  ['C03 Architektura', [['A1', 'YES'], ['A2', 'YES'], ['A3', 'YES'], ['A4', 'YES']]],
  ['C04 Kvalita a měření', [['Q1', 'NO'], ['Q2', 'NO'], ['Q3', 'NO']]],
  ['C05 Detailní návrh', [['D1', 'YES'], ['D2', 'YES'], ['D3', 'YES'], ['D4', 'YES'], ['D5', 'YES']]],
]

const REVIEW_FINDINGS: {
  id: string
  title: string
  found: string
  recommended: string
  decision: 'ACCEPTED' | 'REJECTED'
  reason: string
  action: string
  notes: string
}[] = [
  {
    id: 'F1',
    title: 'Chybí artefakt C04 Kvalita a měření',
    found:
      'V docs/ není žádný dokument C04: chybí quality concern, hodnotitelné kritérium, měření i navazující rozhodnutí a README na C04 neodkazuje. Q1 až Q3 proto dostaly NO.',
    recommended: 'Doplnit nebo odkázat celý řetězec quality concern, kritérium, měření za daných podmínek a rozhodnutí.',
    decision: 'ACCEPTED',
    reason: 'Oprávněné. Jde o jedinou oblast hodnocenou NO a chybí celý povinný artefakt, ne jen detail.',
    action:
      'Doplníme docs/c04/. Návrh: concern je konzistence BR-02 pod souběhem, kritérium „z N souběžných konfliktních požadavků skončí právě jeden jako CONFIRMED“, měření nad souběžným scénářem C02 se zapsanými podmínkami a rozhodnutí navázané na ADR-001.',
    notes:
      'F1 přijímáme. Je to největší díra v hodnocení: tři NO z jediné příčiny. Konkrétní concern je zatím návrh, měření teprve provedeme.',
  },
  {
    id: 'F2',
    title: 'Není určena jedna hodnocená baseline',
    found:
      'HEAD f200832 nemá tag, zatímco dokumentace uvádí b107a9d / c02-baseline-v0.2, 4669362 / c03-architecture a tag c05-detailed-design.',
    recommended: 'Potvrdit, která baseline je hodnocená, a doložit shodu dokumentace, kódu a testů.',
    decision: 'REJECTED',
    reason:
      'Více commitů není rozpor. Každý checkpoint záměrně zapisuje commit, na kterém byl ověřen. Dokumentace, kód a testy na f200832 tvoří jeden konzistentní celek, což recenzenti sami ověřili (B2: testy prošly).',
    action: 'Historické záznamy necháme beze změny. V odpovědi na review uvedeme f200832 jako hodnocenou baseline.',
    notes:
      'F2 odmítáme. Záznamy commitů u C02, C03 a C05 jsou historie jednotlivých checkpointů, ne konkurenční baseline. Stačí v odpovědi pojmenovat hodnocený commit.',
  },
  {
    id: 'F3',
    title: 'Baseline specifikace nejsou schválené',
    found:
      'docs/team-approval.md má u v0.1, v0.2 i v0.2.1 nezaškrtnutý stav, přitom kód implementuje v0.2.1: BR-06, explicitní časový offset a limit poznámky.',
    recommended: 'Potvrdit, která baseline je schválená, nebo oddělit schválenou specifikaci od novějšího kódu.',
    decision: 'ACCEPTED',
    reason:
      'Oprávněné. Schválení je brána každé baseline. Bez podpisů nelze doložit, že kód odpovídá přijaté specifikaci, odtud R4: PARTLY.',
    action:
      'Tým projde v0.1 až v0.2.1 a do team-approval.md zapíše jména, datum a stav. Navrhujeme schválit i v0.2.1, protože jde o opravy z code review.',
    notes:
      'F3 přijímáme. Oprava je levná a zároveň srovná R4 z PARTLY na YES: stačí, aby tým formálně potvrdil baseline, podle které kód vznikl.',
  },
]

export default function AgentReservationsPitch() {
  const Highlighter = useShikiHighlighter({ theme: 'github-dark-default', langs: ['typescript'] })

  return (
    <>
      {/* ---------------------------------------------------------- */}
      {/* 01 · Produkt                                               */}
      {/* ---------------------------------------------------------- */}

      <Slide notes="Začněte slibem, ne technologií. Jedna věta: každý dostane předvídatelný čas na sdílených AI agentech, bez kolizí.">
        <Frame>
          <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 80, alignItems: 'center', flex: 1 }}>
            <div>
              <h1>
                Agent
                <br />
                Reservations
              </h1>
              <p className="lede" style={{ fontSize: 38, color: 'var(--ink-2)', marginTop: 36 }}>
                Spravedlivě sdílený výpočetní čas AI agentů, bez kolizí.
              </p>
              <div className="row" style={{ marginTop: 48, gap: 12, flexWrap: 'wrap' }}>
                <Pill status="CONFIRMED" />
                <Pill status="PENDING_APPROVAL" />
                <Pill status="REJECTED" />
                <Pill status="CANCELLED" />
                <Pill status="EXPIRED" />
              </div>
            </div>
            <Browser src={asset('screenshots/home-public.png')} alt="Veřejný přehled rezervací" scrollTo={0.44} crop={{ x: 0.1, w: 0.8 }} style={{ height: 580 }} />
          </div>
        </Frame>
      </Slide>

      <Slide notes="Hlavní premisa projektu. Agenty nepřidělujeme podle množství — kdy se všichni dělí o výkon a nikdo neví, kolik ho zrovna dostane. Přidělujeme je podle času: uživatel si zarezervuje okno, kdy agenta potřebuje, a v tu chvíli má celého agenta připraveného jen pro sebe. Všechno ostatní v projektu — pravidlo překryvu, limit rezervací, schvalování — z této myšlenky vychází.">
        <Frame title="Agenty přidělujeme podle času, ne podle množství.">
          <div className="body grid cols-2" style={{ gap: 40, alignContent: 'center' }}>
            <div className="card">
              <span className="tag" style={{ color: 'var(--rejected)' }}>
                PODLE MNOŽSTVÍ
              </span>
              <div style={{ height: 300 }}>
                <ShareByQuantityDiagram />
              </div>
              <h3 style={{ marginTop: 24 }}>Všichni najednou, každý jen kousek</h3>
              <p>Výkon agenta se dělí mezi všechny, kdo ho právě používají. Nikdo neví, kolik ho v danou chvíli dostane.</p>
            </div>
            <Fragment className="card" style={{ borderColor: 'var(--confirmed)', borderWidth: 3 }}>
              <span className="tag" style={{ color: 'var(--confirmed)' }}>
                PODLE ČASU · NÁŠ PŘÍSTUP
              </span>
              <div style={{ height: 300 }}>
                <AllocateByTimeDiagram />
              </div>
              <h3 style={{ marginTop: 24 }}>Každý celého agenta, ve svém čase</h3>
              <p>Uživatel si zarezervuje čas, kdy agenta potřebuje. V tu chvíli je agent připravený jen pro něj — nemusí se s nikým dělit.</p>
            </Fragment>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Skutečný snímek běžící aplikace (pohled Jany). Projděte čtyři očíslované oblasti po pořadě.">
        <Frame title="Vidět, rezervovat, schválit — na jednom místě.">
          <div className="body">
            <TwoColumnLayout
              ratio="1.25fr 0.75fr"
              gap="64px"
              align="center"
              left={
                <Browser src={asset('screenshots/home-user.png')} alt="Pohled přihlášeného uživatele" scrollTo={0.185} style={{ height: 690 }}>
                  <Fragment step={1}>
                    <Marker n={1} x="8.6%" y="22.5%" />
                  </Fragment>
                  <Fragment step={2}>
                    <Marker n={2} x="8.6%" y="44%" />
                  </Fragment>
                  <Fragment step={3}>
                    <Marker n={3} x="8.6%" y="69.5%" />
                  </Fragment>
                  <Fragment step={4}>
                    <Marker n={4} x="52.5%" y="69.3%" />
                  </Fragment>
                </Browser>
              }
              right={
                <div className="callouts">
                  <Fragment step={1} className="callout">
                    <span className="marker">1</span>
                    <div>
                      <h3>Katalog agentů</h3>
                      <p>Každý agent předem říká: okamžité potvrzení, nebo nutné schválení.</p>
                    </div>
                  </Fragment>
                  <Fragment step={2} className="callout">
                    <span className="marker">2</span>
                    <div>
                      <h3>Veřejný Ganttův diagram</h3>
                      <p>Každý vidí, co je obsazené — nikdy ale kdo a proč.</p>
                    </div>
                  </Fragment>
                  <Fragment step={3} className="callout">
                    <span className="marker">3</span>
                    <div>
                      <h3>Nejdřív ověřit, pak rezervovat</h3>
                      <p>Dostupnost lze ověřit předem; při uložení se stejně kontroluje znovu.</p>
                    </div>
                  </Fragment>
                  <Fragment step={4} className="callout">
                    <span className="marker">4</span>
                    <div>
                      <h3>Moje rezervace</h3>
                      <p>Aktuální stav každé žádosti, zrušení až do začátku rezervace.</p>
                    </div>
                  </Fragment>
                </div>
              }
            />
          </div>
        </Frame>
      </Slide>

      <Slide notes="Jde o pravidla specifikace BR-01 až BR-05 a AR-01, formulovaná jako sliby zákazníkovi. Každé se vynucuje na právě jednom místě — o tom je následující část o architektuře.">
        <Frame title="Šest slibů — každý je pravidlem ze specifikace.">
          <div className="body grid cols-3" style={{ alignContent: 'center' }}>
            <div className="card">
              <span className="tag">BR-02</span>
              <h3>Nikdy dvakrát obsazeno</h3>
              <p>Dvě rezervace CONFIRMED téhož agenta se nikdy nepřekrývají — ani při souběžných požadavcích.</p>
            </div>
            <div className="card">
              <span className="tag">BR-01</span>
              <h3>Navazující rezervace projdou</h3>
              <p>Polootevřené intervaly <code>[start, end)</code>: 10–11 i 11–12 se vejdou.</p>
            </div>
            <div className="card">
              <span className="tag">BR-04</span>
              <h3>Spravedlivý podíl</h3>
              <p>Nejvýše N aktivních rezervací na uživatele, včetně čekajících. Souběžné požadavky limit neobejdou.</p>
            </div>
            <div className="card">
              <span className="tag">BR-03</span>
              <h3>Zrušit lze do začátku</h3>
              <p>Před <code>startTime</code> lze rezervaci zrušit. Opakované zrušení nic nezmění.</p>
            </div>
            <div className="card">
              <span className="tag">BR-05</span>
              <h3>Jen aktivní agenti</h3>
              <p>Deaktivovaný agent nepřijme žádné nové potvrzení — ani opožděné schválení.</p>
            </div>
            <div className="card">
              <span className="tag">AR-01</span>
              <h3>Identita ze serveru</h3>
              <p>HttpOnly session cookie, hesla uložená jako salted hash. Aktér se nikdy nebere z těla požadavku.</p>
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide steps={2} notes="Krok 1: požadavek, který se jen dotýká hranice, projde. Krok 2: skutečný překryv je odmítnut a nic se neuloží. Kontrolu v paměti i databázový dotaz řídí stejná funkce overlapBounds().">
        <Frame title="Navazující rezervace projdou. Překryv nikdy.">
          <div className="body" style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 36 }}>
            <DiagramStepper animation={regionFadeIn} steps={[{ show: ['touch'] }, { show: ['overlap'] }]}>
              <IntervalDiagram />
            </DiagramStepper>
            <p className="mono" style={{ fontSize: 26, color: 'var(--ink-2)' }}>
              překryv ⇔ existing.start &lt; requested.end ∧ existing.end &gt; requested.start
            </p>
          </div>
        </Frame>
      </Slide>

      <Slide steps={4} notes="Životní cyklus v0.2 ve čtyřech krocích. Agenti bez schválení jdou rovnou do CONFIRMED a lze je zrušit před začátkem. Agenti se schválením čekají v PENDING_APPROVAL; schválení znovu ověří BR-02 a BR-05. Čekající žádost lze zamítnout, vyprší v startTime, nebo ji lze zrušit. O každé šipce rozhoduje Reservation Service — UI a Admin o ni jen žádají.">
        <Frame
          title="Dvě rychlosti: okamžitě pro běžné agenty, se schválením pro drahé."
        >
          <div className="body" style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 24 }}>
            <DiagramStepper
              animation={regionFadeIn}
              steps={[{ show: ['instant'] }, { show: ['cancel'] }, { show: ['pending'] }, { show: ['endings'] }]}
            >
              <StateDiagram />
            </DiagramStepper>
            <p className="muted" style={{ fontSize: 24 }}>
              O každém přechodu rozhoduje <b style={{ color: 'var(--ink)' }}>Reservation Service</b>. User i Admin o něj jen žádají.
            </p>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Klíčový scénář z C03. Dvě překrývající se žádosti o Claude Opus 5 čekají na schválení. Admin nejdřív schválí Petrovu. Když pak klikne na Schválit u Janiny, služba uvnitř transakce znovu ověří BR-02 a odmítne s 409 AGENT_UNAVAILABLE; Janina žádost dál čeká.">
        <Frame title="Opožděné schválení exkluzivitu neprolomí.">
          <div className="body grid cols-2" style={{ gap: 48, alignContent: 'start' }}>
            <div>
              <Browser src={asset('screenshots/admin-pending-before.png')} url="localhost:3000/admin" alt="Fronta žádostí ke schválení" crop={{ x: 0.1, w: 0.8 }} style={{ height: 470 }} />
              <h3 style={{ marginTop: 30 }}>1 · Čekají dvě překrývající se žádosti</h3>
              <p className="muted" style={{ fontSize: 24, marginTop: 8 }}>
                Claude Opus 5 · Jana 10:00–13:00 a Petr 11:00–12:30. Čekající žádosti se navzájem neblokují.
              </p>
            </div>
            <Fragment>
              <Browser src={asset('screenshots/admin-approve-conflict.png')} url="localhost:3000/admin" alt="Schválení odmítnuto kvůli konfliktu" crop={{ x: 0.1, w: 0.8 }} style={{ height: 470 }} />
              <h3 style={{ marginTop: 30 }}>2 · Petr schválen první → Janino schválení odmítnuto</h3>
              <p className="muted" style={{ fontSize: 24, marginTop: 8 }}>
                Znovu ověřeno v transakci schválení: <code>409 AGENT_UNAVAILABLE</code>, žádost zůstává <Pill status="PENDING_APPROVAL" />
              </p>
            </Fragment>
          </div>
        </Frame>
      </Slide>

      {/* ---------------------------------------------------------- */}
      {/* 02 · Architektura                                          */}
      {/* ---------------------------------------------------------- */}

      <Slide>
        <Frame dark section="Architektura">
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h1 style={{ fontSize: 112, maxWidth: 1500 }}>Jeden owner každého rozhodnutí o rezervaci.</h1>
          </div>
        </Frame>
      </Slide>

      <Slide notes="C01 začínal šesti případy užití a okamžitým potvrzením. Povinná změna v0.2 přidala schvalování (UC8), kontrolu dostupnosti (UC7) a tři nové stavy. Architektura musela pojmout rozhodnutí, které teď padá později než žádost.">
        <Frame title="Rozsah rostl. Model držel krok." section="Architektura">
          <div className="body">
            <TwoColumnLayout
              ratio="1fr 1fr"
              gap="48px"
              align="stretch"
              left={
                <div className="card" style={{ height: '100%', display: 'grid', gridTemplateRows: '1fr auto', gap: 20 }}>
                  <img src={asset('images/use-case-v01.png')} alt="Případy užití v0.1" style={{ width: '100%', height: 470, objectFit: 'contain' }} />
                  <div>
                    <span className="tag">BASELINE v0.1</span>
                    <p>UC1–UC6 · vytvoření ověří a potvrdí rezervaci v jednom kroku. Stavy: CONFIRMED, CANCELLED.</p>
                  </div>
                </div>
              }
              right={
                <Fragment className="card" style={{ height: '100%', display: 'grid', gridTemplateRows: '1fr auto', gap: 20 }}>
                  <img src={asset('images/use-case-v02.png')} alt="Případy užití v0.2" style={{ width: '100%', height: 470, objectFit: 'contain' }} />
                  <div>
                    <span className="tag" style={{ color: 'var(--confirmed)' }}>BASELINE v0.2</span>
                    <p>+ UC7 dostupnost, UC8 schválení / zamítnutí · + PENDING_APPROVAL, REJECTED, EXPIRED · skutečné přihlašování.</p>
                  </div>
                </Fragment>
              }
            />
          </div>
        </Frame>
      </Slide>

      <Slide notes="Architecture drivers jsou problémy, ne řešení. Reservation Service nebo samostatná služba jsou kandidátní odpovědi, nikoli drivers.">
        <Frame title="Na co musí architektura odpovědět." section="Architektura">
          <div className="body" style={{ display: 'flex', alignItems: 'center' }}>
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Zdroj</th>
                  <th style={{ width: '38%' }}>Tlak</th>
                  <th>Otázka, kterou vyvolává</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">BR-02 · REQ-07/10</td>
                  <td>Oddělené požadavky mohou vidět stejný volný termín a předhánět se v zápisu.</td>
                  <td>Kde padá jediné autoritativní „ano“?</td>
                </tr>
                <tr>
                  <td className="mono">REQ-09 … 11</td>
                  <td>PENDING musí přežít původní požadavek a při rozhodnutí se znovu ověřit.</td>
                  <td>Kdo vlastní čekající stav a pozdější schválení / zamítnutí?</td>
                </tr>
                <tr>
                  <td className="mono">REQ-12</td>
                  <td>Vypršení při <code>now ≥ startTime</code> může odhalit libovolné čtení i příkaz.</td>
                  <td>Kdo uplatňuje vypršení jednotně?</td>
                </tr>
                <tr>
                  <td className="mono">AR-01</td>
                  <td>Data v požadavku nejsou identita; OP-05 smí jen Admin.</td>
                  <td>Kde se odděluje autentizace od doménových pravidel?</td>
                </tr>
                <tr>
                  <td className="mono">Zjištění AS-IS</td>
                  <td>Šest Route Handlers zapisovalo stav životního cyklu přímo.</td>
                  <td>Jaké pravidlo zabrání, aby se z adaptérů stali vlastníci?</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Obě alternativy chování zvládnou. Projděte scénář: čekající žádost, vznikne překryv, Admin schvaluje. B funguje jen tehdy, když služba výhradně vlastní svou databázi, a přidává způsoby selhání sítě, pro které nemáme žádný driver.">
        <Frame
          title="Kde má žít autoritativní rozhodnutí o životním cyklu?"
          section="Architektura"
        >
          <div className="body grid cols-2" style={{ gap: 40, alignContent: 'center' }}>
            <Fragment step={1} className="card" style={{ position: 'relative' }}>
              <span className="tag">ALTERNATIVA A</span>
              <Fragment step={3} style={{ position: 'absolute', top: 30, right: 32 }}>
                <Pill status="CONFIRMED">ZVOLENO · ADR-001</Pill>
              </Fragment>
              <h3>Reservation Service uvnitř současné aplikace</h3>
              <p className="mono" style={{ fontSize: 22, margin: '18px 0', color: 'var(--ink-2)' }}>
                API adaptéry → Reservation Service → SQLite (Prisma)
              </p>
              <ul className="clean small">
                <li>Kontrola i zápis v jedné lokální transakci</li>
                <li>Žádná další služba k nasazení, síťové volání ani strategie opakování</li>
                <li>Identita se ověří jednou, uvnitř procesu</li>
              </ul>
            </Fragment>
            <Fragment step={2} className="card">
              <span className="tag">ALTERNATIVA B</span>
              <h3>Samostatná Reservation Decision Service</h3>
              <p className="mono" style={{ fontSize: 22, margin: '18px 0', color: 'var(--ink-2)' }}>
                Next.js —HTTP→ Decision Service → vlastní databáze
              </p>
              <ul className="clean small red">
                <li>Vyžaduje výhradně vlastněnou DB nebo distribuovanou konzistenci</li>
                <li>Volající musí odlišit doménový konflikt od výpadku sítě</li>
                <li>Podepsaná identita mezi službami, nasazení, kontroly stavu, verzování</li>
              </ul>
            </Fragment>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Stejný scénář prošlý oběma variantami. A vítězí přiměřeností, ne schopnostmi.">
        <Frame title="Stejná správnost. Zlomek pohyblivých částí." section="Architektura">
          <div className="body" style={{ display: 'flex', alignItems: 'center' }}>
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Kritérium</th>
                  <th style={{ width: '40%' }}>A · modulární monolit</th>
                  <th>B · samostatná služba</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">BR-02</td>
                  <td className="win">Jedna metoda služby, jedna lokální transakce</td>
                  <td className="lose">Jen pokud služba výhradně vlastní svou DB</td>
                </tr>
                <tr>
                  <td className="mono">Odložené schválení</td>
                  <td className="win">PENDING zůstává v SQLite; každý pozdější požadavek dojde ke stejnému vlastníkovi</td>
                  <td className="lose">Funguje, ale každé rozhodnutí potřebuje běžící službu a síťové volání</td>
                </tr>
                <tr>
                  <td className="mono">Vypršení</td>
                  <td className="win">Jeden modul, jedno časové pravidlo pro čtení i příkazy</td>
                  <td className="lose">Jednotné, ale volající řeší vzdálené chyby a vypršené limity</td>
                </tr>
                <tr>
                  <td className="mono">Hranice důvěry</td>
                  <td className="win">Adaptér ověří Session a předá typovaného aktéra</td>
                  <td className="lose">Identita putuje sítí, potřebuje podepsané přihlašovací údaje</td>
                </tr>
                <tr>
                  <td className="mono">Provoz</td>
                  <td className="win">Žádné nové nasazení, databáze ani další věc ke sledování</td>
                  <td className="lose">Nasazení, kontroly stavu, opakování, verzování, vlastnictví DB</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Frame>
      </Slide>

      <Slide steps={6} notes="Statický pohled skládejte po krocích: UI, tenké HTTP adaptéry, Session & Auth vedle Reservation Service, čistá Policy (přidaná v C05), Prisma a SQLite. Poslední krok: zakázaná hrana. Adaptéry nesmí zapisovat stav Reservation; pokud to udělají, npm run test:architecture selže.">
        <Frame title="Tenké adaptéry. Jeden vlastník životního cyklu. Jeden proces." section="Architektura">
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

      <Slide steps={2} notes="Stav AS-IS z C03 části A: handlery pro vytvoření, zrušení a rozhodnutí zapisovaly stav a tři seznamové handlery nechávaly čekající žádosti vypršet přes updateMany. Výraz pro překryv existoval třikrát. Po C03 vede každá cesta přes jednu službu; C05 vytáhl pravidla do čisté policy.">
        <Frame title="Od šesti zapisovatelů k jedinému vlastníkovi." section="Architektura">
          <div className="body" style={{ display: 'flex', alignItems: 'center' }}>
            <DiagramStepper animation={regionFadeIn} steps={[{ show: ['tobe'] }, { show: ['svc'], highlight: ['svc'] }]}>
              <OwnershipDiagram />
            </DiagramStepper>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Nudné záměrně. SQLite v jednom procesu řadí zápisy za sebe, a právě proto je záruka při souběhu levná. ADR pojmenovává, kdy to přestane platit.">
        <Frame title="Záměrně nudná infrastruktura." section="Architektura">
          <div className="body grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 28, alignContent: 'center' }}>
            <div className="card">
              <div className="big-num">1</div>
              <h3 style={{ marginTop: 18 }}>nasazovaná aplikace</h3>
              <p>Proces Next.js / Node.js obsluhuje UI, API i doménovou logiku.</p>
            </div>
            <div className="card">
              <div className="big-num">0</div>
              <h3 style={{ marginTop: 18 }}>síťových volání na rozhodnutí</h3>
              <p>Kontrola i zápis proběhnou v jedné lokální transakci.</p>
            </div>
            <div className="card">
              <div className="big-num">1</div>
              <h3 style={{ marginTop: 18 }}>databázový soubor</h3>
              <p>SQLite přes adaptér better-sqlite3. Zápisy probíhají jeden po druhém.</p>
            </div>
            <div style={{ gridColumn: 'span 3', marginTop: 20 }}>
              <span className="tag">TECHNOLOGIE</span>
              <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
                {['Next.js 16.3', 'React 19.2', 'TypeScript 5', 'Prisma 7.10', 'SQLite', 'Tailwind CSS 4', 'testovací skripty (tsx)', 'GitHub Actions CI'].map((s) => (
                  <Pill key={s} status="ghost">
                    {s}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        </Frame>
      </Slide>

      {/* ---------------------------------------------------------- */}
      {/* 03 · Detailní návrh                                       */}
      {/* ---------------------------------------------------------- */}

      <Slide>
        <Frame dark section="Detailní návrh">
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h1 style={{ fontSize: 112, maxWidth: 1500 }}>Pravidla jako pure funkce.</h1>
            <p className="lede" style={{ fontSize: 36 }}>
              Logika aplikace je ve funkcionálním stylu pro přehlednost a testovatelnost.
            </p>
          </div>
        </Frame>
      </Slide>

      <Slide steps={4} notes="reservation-policy.ts nemá žádný import, hlídá to kontrola architektury. Projděte: špatný stav, hranice startTime (platí i pro zamítnutí), plán a nakonec kontroly potvrzení v záměrném pořadí: neaktivní agent má přednost před překryvem.">
        <Frame title="Pravidla se vejdou na jednu obrazovku — a nepotřebují databázi." section="Detailní návrh">
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
                ['Čas má přednost před Adminem', 'Od startTime žádost vyprší — i při zamítnutí.'],
                ['Plán, ne vedlejší efekt', 'Policy vrátí, co se má stát; provede to služba.'],
                ['Kontroly v pevném pořadí', 'Nejdřív neaktivní agent, pak překryv BR-02 načtený uvnitř transakce.'],
              ].map(([h, p], i) => (
                <Fragment key={h} step={i + 1} exit={i + 2} style={{ gridArea: '1 / 1' }}>
                  <span className="tag" style={{ color: 'var(--confirmed)' }}>
                    KROK {i + 1} / 4
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

      <Slide notes="Policy vyhazuje ReservationRuleViolation s doménovým kódem. api-error-response.ts je jediné místo, kde se z kódu stává HTTP status. Tím se opravilo skutečné zjištění z revize: policy dřív vyhazovala HTTP chyby.">
        <Frame title="Doména mluví v kódech. HTTP mluví jen adaptér." section="Detailní návrh">
          <div className="body" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 64, alignItems: 'center' }}>
            <table className="t">
              <thead>
                <tr>
                  <th>ReservationRuleCode</th>
                  <th>Význam</th>
                  <th style={{ textAlign: 'right' }}>HTTP</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['NOT_OWNER', 'aktér není vlastník ani ADMIN', 403],
                  ['QUOTA_EXCEEDED', 'BR-04 by byl překročen', 403],
                  ['INVALID_STATE', 'zdrojový stav přechod nepovoluje', 409],
                  ['AFTER_START', 'now ≥ startTime', 409],
                  ['AGENT_INACTIVE', 'BR-05', 409],
                  ['AGENT_UNAVAILABLE', 'BR-02 · existuje překrývající se CONFIRMED', 409],
                ].map(([code, meaning, http]) => (
                  <tr key={code}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {code}
                    </td>
                    <td className="muted">{meaning}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {http}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card" style={{ background: 'var(--ink)', color: '#f4f2ec', border: 0 }}>
              <span className="tag" style={{ color: '#34d399' }}>
                SMĚR ZÁVISLOSTÍ
              </span>
              <p className="mono" style={{ color: '#f4f2ec', fontSize: 23, lineHeight: 1.9 }}>
                Route Handler
                <br />→ reservation-service
                <br />→ reservation-policy
                <br />
                <span style={{ color: '#34d399' }}>importy policy: 0</span>
              </p>
              <p style={{ color: '#a3a8b2', fontSize: 21, marginTop: 18 }}>Hlídá npm run test:architecture.</p>
            </div>
          </div>
        </Frame>
      </Slide>

      {/* ---------------------------------------------------------- */}
      {/* 04 · Ověření                                              */}
      {/* ---------------------------------------------------------- */}

      <Slide>
        <Frame dark section="Ověření">
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h1 style={{ fontSize: 112, maxWidth: 1500 }}>Ověřeno, ne jen slíbeno.</h1>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Poslední běh 2026-10-19 po opravách v0.2.1 nad čistou databází SQLite. Jednotkové testy nepotřebují databázi ani běžící aplikaci. Sada C02 prověřuje HTTP + SQLite včetně souběžného vytvoření a schválení; spuštěna dvakrát po sobě proti produkčnímu buildu.">
        <Frame title="Za každou garancí stojí test." section="Ověření">
          <div className="body grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, alignContent: 'center' }}>
            <div className="card">
              <div className="big-num em-green">20/20</div>
              <h3 style={{ marginTop: 20 }}>jednotkových testů policy</h3>
              <p>
                <code>test:c05</code> · hranice, idempotence, vypršení, pořadí kontrol, BR-06. Bez DB.
              </p>
            </div>
            <div className="card">
              <div className="big-num em-green">31/31</div>
              <h3 style={{ marginTop: 20 }}>end-to-end scénářů</h3>
              <p>
                <code>test:c02</code> · HTTP + SQLite, přihlášení, souběh, BR-06, chybná data v požadavku.
              </p>
            </div>
            <div className="card">
              <div className="big-num em-green">PASS</div>
              <h3 style={{ marginTop: 20 }}>architektonické pravidlo</h3>
              <p>
                <code>test:architecture</code> · jediný zapisovatel, transakce, policy bez importů.
              </p>
            </div>
            <div className="card">
              <div className="big-num em-green">PASS</div>
              <h3 style={{ marginTop: 20 }}>spike ukládání dat</h3>
              <p>
                <code>test:api-persistence</code> · ID z API = ID načtené zpět z DB.
              </p>
            </div>
            <div style={{ gridColumn: 'span 4' }} className="row">
              <Pill status="CONFIRMED">lint · PASS</Pill>
              <Pill status="CONFIRMED">typecheck · PASS</Pill>
              <Pill status="CONFIRMED">next build · PASS</Pill>
              <span className="muted" style={{ fontSize: 22, marginLeft: 12 }}>
                Kontrola architektury ověřena i negativně: podstrčené <code>db.reservation.update(</code> ji shodí.
              </span>
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Čtyři kontrolní body kurzu, každý zanechal doklady v docs/.">
        <Frame title="Jak jsme se sem dostali." section="Ověření">
          <div className="body" style={{ display: 'flex', alignItems: 'center' }}>
            <div className="timeline" style={{ width: '100%' }}>
              <Fragment className="milestone">
                <span className="tag">C01 · SPIKE</span>
                <h3>Dokážeme to uložit?</h3>
                <p>POST → SQLite → zpětné načtení. Prisma + SQLite zůstaly jako vrstva ukládání dat pro walking skeleton.</p>
              </Fragment>
              <Fragment className="milestone">
                <span className="tag">C02 · SPECIFIKACE</span>
                <h3>Pravidla a operace</h3>
                <p>BR-01…05, OP-01…05, změna v0.2 se schvalováním, skutečné přihlašování, 25 E2E scénářů.</p>
              </Fragment>
              <Fragment className="milestone">
                <span className="tag">C03 · ARCHITEKTURA</span>
                <h3>Jeden vlastník životního cyklu</h3>
                <p>Architecture drivers, alternativy, ADR-001, sedm konzistentních pohledů, kontrola souladu s architekturou.</p>
              </Fragment>
              <Fragment className="milestone">
                <span className="tag">C05 · DETAILNÍ NÁVRH</span>
                <h3>Čistá policy</h3>
                <p>Kontrakty, rozhodovací tabulky, 16 odvozených jednotkových testů, revize návrhu vůči kódu. Tag c05-detailed-design.</p>
              </Fragment>
            </div>
          </div>
        </Frame>
      </Slide>

      <Slide notes="Pojmenovaná rizika, ne skrytá. Další tlak, který jsme vybrali (kategorie R), je selhání agenta těsně před rezervovaným oknem. Náčrt ukazuje zvažované možnosti: zkrátit, posunout, nebo přeskládat rozvrh.">
        <Frame title="Známé limity." section="Ověření">
          <div className="body grid" style={{ gridTemplateColumns: '1fr 0.9fr', gap: 56, alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 40 }}>
              <div>
                <span className="tag" style={{ color: 'var(--rejected)' }}>ZBÝVAJÍCÍ RIZIKA</span>
                <ul className="clean small red">
                  <li>Bezpečnost při souběhu stojí na tom, že SQLite v jednom procesu řadí zápisy za sebe</li>
                  <li>Omezení pokusů o přihlášení drží stav v paměti, platí jen pro jeden proces</li>
                  <li>Kontrola architektury stojí na regulárních výrazech, ne na AST</li>
                </ul>
              </div>
              <div>
                <span className="tag" style={{ color: 'var(--confirmed)' }}>DÁLE</span>
                <ul className="clean small">
                  <li>Přesunout kontrolu BR-05 při vytvoření ze služby do policy</li>
                  <li>Před změnou databáze rozhodnout o izolaci / zamykání</li>
                  <li>Výpadek agenta: zkrátit, posunout nebo přeskládat dotčené rezervace</li>
                </ul>
              </div>
            </div>
            <div className="card" style={{ padding: 28 }}>
              <span className="tag">BUDOUCÍ TLAK · AGENT SELŽE TĚSNĚ PŘED REZERVACÍ</span>
              <img src={asset('images/outage-options.webp')} alt="Náčrt možností řešení výpadku" style={{ width: '100%', height: 560, objectFit: 'contain' }} />
            </div>
          </div>
        </Frame>
      </Slide>

      {/* ---------------------------------------------------------- */}
      {/* 05 · Review (C06)                                          */}
      {/* ---------------------------------------------------------- */}

      <Slide notes="C06 review od týmu Parking reservation system (JEC0014, TOK0030, SIK0224), 24. 10. 2026 na commitu f200832. Z 19 bodů 14× YES, 2× PARTLY, 3× NO. Všechna NO jsou z jediné oblasti: chybějící C04. Architektura a detailní návrh prošly bez výhrad.">
        <Frame title="Review od týmu Parking reservation system" section="Review">
          <div className="body grid" style={{ gridTemplateColumns: '1.2fr 0.8fr', gap: 48, alignContent: 'center' }}>
            <div className="card" style={{ display: 'grid', gap: 22 }}>
              {REVIEW_SCORECARD.map(([area, items]) => (
                <div key={area} style={{ display: 'grid', gridTemplateColumns: '240px 1fr', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 24, fontWeight: 600 }}>{area}</span>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {items.map(([id, verdict]) => (
                      <Pill key={id} status={VERDICT_PILL[verdict]}>
                        {id} {verdict}
                      </Pill>
                    ))}
                  </div>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 21, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
                14× YES, 2× PARTLY, 3× NO. Hodnoceno 24. 10. 2026 na commitu <code>f200832</code>.
              </p>
            </div>
            <div style={{ display: 'grid', gap: 36 }}>
              <div>
                <span className="tag" style={{ color: 'var(--confirmed)' }}>CO SE JIM LÍBILO</span>
                <ul className="clean small">
                  <li>Aplikace i testy jdou spustit na čisté databázi, C01 spike i sada C02 prošly</li>
                  <li>Architektura sedí s kódem: Reservation Service je skutečně jediný owner změn stavu</li>
                  <li>Detailní návrh odpovídá kódu, 20/20 jednotkových testů se smysluplnými očekávanými výsledky</li>
                </ul>
              </div>
              <div>
                <span className="tag" style={{ color: 'var(--rejected)' }}>CO VYTKLI</span>
                <ul className="clean small red">
                  <li>Chybí artefakt C04: kritérium kvality, měření ani rozhodnutí (F1)</li>
                  <li>Dokumentace neuvádí jednu hodnocenou baseline (F2)</li>
                  <li>Baseline v0.1 až v0.2.1 nejsou schválené, v0.2.1 přesto běží v kódu (F3)</li>
                </ul>
              </div>
            </div>
          </div>
        </Frame>
      </Slide>

      {REVIEW_FINDINGS.map((finding) => (
        <Slide key={finding.id} notes={finding.notes}>
          <Frame title={`${finding.id} · ${finding.title}`} section="Review">
            <div className="body grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 40, alignContent: 'center' }}>
              <div style={{ display: 'grid', gap: 28 }}>
                <div className="card">
                  <span className="tag">CO NAŠLI</span>
                  <p style={{ color: 'var(--ink-2)' }}>{finding.found}</p>
                </div>
                <div className="card">
                  <span className="tag">DOPORUČENÁ AKCE</span>
                  <p style={{ color: 'var(--ink-2)' }}>{finding.recommended}</p>
                </div>
              </div>
              <Fragment
                className="card"
                style={{
                  borderWidth: 3,
                  borderColor: finding.decision === 'ACCEPTED' ? 'var(--confirmed)' : 'var(--rejected)',
                  display: 'grid',
                  gap: 22,
                  alignContent: 'start',
                }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="tag" style={{ margin: 0 }}>NAŠE ROZHODNUTÍ</span>
                  <Pill status={finding.decision === 'ACCEPTED' ? 'CONFIRMED' : 'REJECTED'}>{finding.decision}</Pill>
                </div>
                <p style={{ color: 'var(--ink)', fontSize: 27 }}>{finding.reason}</p>
                <div>
                  <span className="tag">{finding.decision === 'ACCEPTED' ? 'CO UDĚLÁME' : 'BEZE ZMĚNY'}</span>
                  <p style={{ color: 'var(--ink-2)' }}>{finding.action}</p>
                </div>
              </Fragment>
            </div>
          </Frame>
        </Slide>
      ))}

      <Slide notes="Zakončete produktem: skutečná aplikace, kterou si uživatel otevře — katalog agentů, veřejný Ganttův diagram a vlastní rezervace na jedné obrazovce.">
        <Frame dark>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 80, alignItems: 'center' }}>
            <div>
              <div className="row" style={{ marginBottom: 36 }}>
                <BrandMark />
              </div>
              <h1 style={{ fontSize: 100 }}>Rezervujte agenta, ne hádku.</h1>
              <p className="lede" style={{ fontSize: 34 }}>
                Předvídatelné pro uživatele, ovladatelné pro administrátory, prokazatelné pro inženýry.
              </p>
            </div>
            <Browser
              src={asset('screenshots/home-user.png')}
              alt="Aplikace Agent Reservations — pohled přihlášeného uživatele"
              crop={{ x: 0.1, w: 0.8 }}
              style={{ height: 720, border: 0 }}
            />
          </div>
        </Frame>
      </Slide>
    </>
  )
}
