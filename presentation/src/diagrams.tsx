import { DiagramRegion } from '@react-slides/core'

function ArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="#2b303a" />
      </marker>
      <marker id={`${id}-arrow-red`} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="#e11d48" />
      </marker>
    </defs>
  )
}

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  soft,
}: {
  x: number
  y: number
  w: number
  h: number
  title: string
  sub?: string
  soft?: boolean
}) {
  const cx = x + w / 2
  return (
    <g>
      <rect className={`box${soft ? ' soft' : ''}`} x={x} y={y} width={w} height={h} rx={14} />
      <text className="t-title" x={cx} y={sub ? y + h / 2 - 4 : y + h / 2 + 9} textAnchor="middle">
        {title}
      </text>
      {sub && (
        <text className="t-sub" x={cx} y={y + h / 2 + 26} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  )
}

function Cylinder({ x, y, w, h, title, sub }: { x: number; y: number; w: number; h: number; title: string; sub?: string }) {
  const ry = 18
  return (
    <g>
      <path
        className="box"
        d={`M${x} ${y + ry} A${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} A${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z`}
      />
      <path className="box" d={`M${x} ${y + ry} A${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry}`} fill="none" />
      <text className="t-title" x={x + w / 2} y={y + h / 2 + 8} textAnchor="middle">
        {title}
      </text>
      {sub && (
        <text className="t-sub" x={x + w / 2} y={y + h / 2 + 34} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Core premise: allocate an agent by time, not by quantity            */
/* ------------------------------------------------------------------ */

function AllocationAxis() {
  const hours = [9, 10, 11, 12]
  return (
    <g>
      <line x1={40} y1={250} x2={720} y2={250} stroke="#0e1116" strokeWidth={2} />
      {hours.map((h, i) => (
        <g key={h}>
          <line x1={40 + i * 226.7} y1={242} x2={40 + i * 226.7} y2={258} stroke="#0e1116" strokeWidth={2} />
          <text className="t-label" x={40 + i * 226.7} y={286} textAnchor="middle">
            {h}:00
          </text>
        </g>
      ))}
    </g>
  )
}

const LANE = { x: 40, y: 30, w: 680, h: 196 }

function BarLabel({ x, y, children, fill = '#fff' }: { x: number; y: number; children: string; fill?: string }) {
  return (
    <text x={x} y={y} style={{ fill, fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 20 }}>
      {children}
    </text>
  )
}

/** Quantity: every user holds a slice of the agent for the whole period. */
export function ShareByQuantityDiagram() {
  const users = ['Jana', 'Petr', 'Eva']
  const h = (LANE.h - 16) / 3
  return (
    <svg className="dia" viewBox="0 0 760 300">
      <rect x={LANE.x} y={LANE.y} width={LANE.w} height={LANE.h} rx={12} fill="#e8e5dc" />
      {users.map((u, i) => (
        <g key={u}>
          <rect x={LANE.x + 8} y={LANE.y + 8 + i * h} width={LANE.w - 16} height={h - 6} rx={8} fill="#94a3b8" />
          <BarLabel x={LANE.x + 26} y={LANE.y + 8 + i * h + h / 2 + 4}>{`${u} · 1/3 výkonu`}</BarLabel>
        </g>
      ))}
      <AllocationAxis />
    </svg>
  )
}

/** Time: each user gets the whole agent in their own window. */
export function AllocateByTimeDiagram() {
  const slots = [
    { u: 'Jana', from: 0 },
    { u: 'Petr', from: 1 },
    { u: 'Eva', from: 2 },
  ]
  const w = (LANE.w - 16) / 3
  return (
    <svg className="dia" viewBox="0 0 760 300">
      <rect x={LANE.x} y={LANE.y} width={LANE.w} height={LANE.h} rx={12} fill="#e8e5dc" />
      {slots.map(({ u, from }) => (
        <g key={u}>
          <rect x={LANE.x + 8 + from * w} y={LANE.y + 8} width={w - 6} height={LANE.h - 16} rx={8} fill="#059669" />
          <BarLabel x={LANE.x + 26 + from * w} y={LANE.y + 92}>{u}</BarLabel>
          <BarLabel x={LANE.x + 26 + from * w} y={LANE.y + 122}>celý agent</BarLabel>
        </g>
      ))}
      <AllocationAxis />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* BR-01 / BR-02: half-open intervals                                  */
/* ------------------------------------------------------------------ */

export function IntervalDiagram() {
  const x = (h: number) => 100 + (h - 9) * 350
  const ticks = [9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13]
  const label = (h: number) => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`
  return (
    <svg className="dia" viewBox="0 0 1600 440">
      <line x1={x(9)} y1={390} x2={x(13)} y2={390} stroke="#0e1116" strokeWidth={2} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={382} x2={x(t)} y2={398} stroke="#0e1116" strokeWidth={t % 1 ? 1 : 2} />
          {t % 1 === 0 && (
            <text className="t-label" x={x(t)} y={428} textAnchor="middle">
              {label(t)}
            </text>
          )}
        </g>
      ))}

      <rect x={x(10)} y={50} width={350} height={74} rx={10} fill="#059669" />
      <text x={x(10) + 20} y={95} style={{ fill: '#fff', fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 19 }}>
        CONFIRMED [10:00, 11:00)
      </text>

      <line x1={x(11)} y1={30} x2={x(11)} y2={382} stroke="#646a76" strokeWidth={2} strokeDasharray="6 6" />

      <DiagramRegion id="touch">
        <rect x={x(11)} y={156} width={350} height={74} rx={10} fill="#ecfdf5" stroke="#059669" strokeWidth={3} />
        <text x={x(11) + 22} y={202} style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 21 }}>
          požadavek [11:00, 12:00)
        </text>
        <text x={x(12) + 30} y={202} style={{ fill: '#059669', fontWeight: 600, fontSize: 25 }}>
          ✓ přijato: dotyk není překryv
        </text>
      </DiagramRegion>

      <DiagramRegion id="overlap">
        <rect x={x(10.5)} y={40} width={175} height={300} fill="#e11d48" opacity={0.1} />
        <rect x={x(10.5)} y={262} width={350} height={74} rx={10} fill="#fff1f2" stroke="#e11d48" strokeWidth={3} />
        <text x={x(10.5) + 22} y={308} style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 21 }}>
          požadavek [10:30, 11:30)
        </text>
        <text x={x(11.5) + 30} y={308} style={{ fill: '#e11d48', fontWeight: 600, fontSize: 25 }}>
          ✕ odmítnuto: 409, nic se neuloží
        </text>
      </DiagramRegion>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* C03 G2 + C05: static architecture inside one deployable             */
/* ------------------------------------------------------------------ */

export function ArchitectureDiagram() {
  const a = 'url(#arch-arrow)'
  return (
    <svg className="dia" viewBox="0 0 1680 690">
      <ArrowDefs id="arch" />
      <Box x={0} y={250} w={170} h={110} title="Prohlížeč" sub="User · Admin" soft />
      <rect className="boundary" x={220} y={20} width={1200} height={640} rx={22} />
      <text className="t-label" x={248} y={58}>
        JEDEN PROCES NEXT.JS / NODE.JS
      </text>

      <DiagramRegion id="ui">
        <path className="edge" d="M170 305 H266" markerEnd={a} />
        <Box x={268} y={250} w={200} h={110} title="Web UI" sub="React 19 klient" />
      </DiagramRegion>

      <DiagramRegion id="api">
        <path className="edge" d="M468 305 H526" markerEnd={a} />
        <Box x={528} y={250} w={232} h={110} title="API adaptéry" sub="Route Handlers" />
      </DiagramRegion>

      <DiagramRegion id="auth">
        <path className="edge" d="M644 250 V178 Q644 140 682 140 H828" markerEnd={a} />
        <Box x={830} y={90} w={270} h={100} title="Session & Auth" sub="lib/auth.ts · AR-01" />
      </DiagramRegion>

      <DiagramRegion id="rms">
        <path className="edge" d="M760 305 H828" markerEnd={a} />
        <Box x={830} y={250} w={270} h={110} title="Reservation Service" sub="jediný vlastník cyklu" />
      </DiagramRegion>

      <DiagramRegion id="policy">
        <path className="edge" d="M965 360 V418" markerEnd={a} />
        <Box x={830} y={420} w={270} h={96} title="Reservation Policy" sub="čistá pravidla · 0 importů" />
      </DiagramRegion>

      <DiagramRegion id="persist">
        <path className="edge" d="M1100 140 H1247 Q1285 140 1285 178 V248" markerEnd={a} />
        <path className="edge" d="M1100 305 H1168" markerEnd={a} />
        <Box x={1170} y={250} w={230} h={110} title="Prisma adaptér" sub="transakce" />
        <path className="edge" d="M1400 305 H1478" markerEnd={a} />
        <Cylinder x={1480} y={235} w={190} h={140} title="SQLite" sub="jeden soubor" />
      </DiagramRegion>

      <DiagramRegion id="forbidden">
        <path className="edge bad" d="M644 360 V572 Q644 600 672 600 H1257 Q1285 600 1285 572 V362" markerEnd="url(#arch-arrow-red)" />
        <circle cx={965} cy={600} r={22} fill="#e11d48" />
        <text x={965} y={609} textAnchor="middle" style={{ fill: '#fff', fontWeight: 700, fontSize: 26 }}>
          ✕
        </text>
        <text className="t-label" x={965} y={644} textAnchor="middle" style={{ fill: '#e11d48' }}>
          žádné přímé zápisy Reservation · npm run test:architecture
        </text>
      </DiagramRegion>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* C03 Part A → TO-BE: who writes Reservation state                    */
/* ------------------------------------------------------------------ */

const HANDLERS = [
  'POST /reservations',
  'GET /availability',
  'PATCH …/cancel',
  'PATCH …/decision',
  'GET /reservations',
  'GET …/mine, /admin/…',
]

export function OwnershipDiagram() {
  const red = 'url(#own-arrow-red)'
  const a = 'url(#own-arrow)'
  const y = (i: number) => 80 + i * 82
  return (
    <svg className="dia" viewBox="0 0 1680 600">
      <ArrowDefs id="own" />

      <text className="t-label" x={40} y={34}>
        AS-IS · PŘED C03
      </text>
      {HANDLERS.map((h, i) => (
        <g key={h}>
          <rect className="box soft" x={40} y={y(i)} width={300} height={58} rx={10} />
          <text x={60} y={y(i) + 37} style={{ fontFamily: 'var(--mono)', fontSize: 19 }}>
            {h}
          </text>
          <path className="edge bad" d={`M340 ${y(i) + 29} C 460 ${y(i) + 29}, 450 330, 540 330`} />
        </g>
      ))}
      <path className="edge bad" d="M540 330 H598" markerEnd={red} />
      <Cylinder x={600} y={262} w={160} h={136} title="SQLite" />
      <text className="t-label" x={40} y={590} style={{ fill: '#e11d48' }}>
        6 adaptérů zapisuje stav · pravidlo překryvu 3×
      </text>

      <DiagramRegion id="tobe">
        <line x1={840} y1={20} x2={840} y2={580} stroke="#d9d5ca" strokeWidth={2} />
        <text className="t-label" x={900} y={34}>
          TO-BE · PO C03 + C05
        </text>
        {HANDLERS.map((h, i) => (
          <g key={h}>
            <rect className="box soft" x={900} y={y(i)} width={290} height={58} rx={10} />
            <text x={920} y={y(i) + 37} style={{ fontFamily: 'var(--mono)', fontSize: 19 }}>
              {h}
            </text>
            <path className="edge" d={`M1190 ${y(i) + 29} C 1225 ${y(i) + 29}, 1215 300, 1238 300`} />
          </g>
        ))}
        <text className="t-label" x={900} y={590} style={{ fill: '#059669' }}>
          1 vlastník · 1 definice překryvu · 1 transakce
        </text>
      </DiagramRegion>

      <DiagramRegion id="svc">
        <path className="edge" d="M1238 300 H1268" markerEnd={a} />
        <Box x={1270} y={240} w={210} h={120} title="Reservation" sub="Service" />
        <path className="edge" d="M1375 360 V418" markerEnd={a} />
        <Box x={1270} y={420} w={210} h={84} title="Policy" sub="čistá" />
        <path className="edge" d="M1480 300 H1518" markerEnd={a} />
        <Cylinder x={1520} y={232} w={150} h={136} title="SQLite" />
      </DiagramRegion>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* C03 G3: v0.2 lifecycle, every transition owned by the service       */
/* ------------------------------------------------------------------ */

function StateBox({ x, y, w, label, fill, ink = '#fff' }: { x: number; y: number; w: number; label: string; fill: string; ink?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={80} rx={40} fill={fill} />
      <text x={x + w / 2} y={y + 48} textAnchor="middle" style={{ fill: ink, fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 24 }}>
        {label}
      </text>
    </g>
  )
}

function EdgeLabel({ x, y, children, anchor = 'middle', muted }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end'; muted?: boolean }) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={{ fontSize: 21, fill: muted ? '#646a76' : '#2b303a' }}>
      {children}
    </text>
  )
}

export function StateDiagram() {
  const a = 'url(#state-arrow)'
  return (
    <svg className="dia" viewBox="0 0 1500 520">
      <ArrowDefs id="state" />
      <circle cx={50} cy={290} r={16} fill="#0e1116" />

      <DiagramRegion id="instant">
        <path className="edge" d="M64 300 C 150 400, 200 435, 318 435" markerEnd={a} />
        <EdgeLabel x={190} y={486}>vytvoření · bez schválení</EdgeLabel>
        <StateBox x={320} y={395} w={340} label="CONFIRMED" fill="#059669" />
      </DiagramRegion>

      <DiagramRegion id="cancel">
        <path className="edge" d="M660 448 H1108" markerEnd={a} />
        <EdgeLabel x={880} y={482}>zrušení před startTime</EdgeLabel>
        <StateBox x={1110} y={395} w={330} label="CANCELLED" fill="#94a3b8" />
      </DiagramRegion>

      <DiagramRegion id="pending">
        <path className="edge" d="M64 280 C 150 180, 200 145, 318 145" markerEnd={a} />
        <EdgeLabel x={175} y={118}>vytvoření · nutné schválení</EdgeLabel>
        <StateBox x={320} y={105} w={340} label="PENDING_APPROVAL" fill="#fbbf24" ink="#451a03" />
        <path className="edge" d="M490 185 V393" markerEnd={a} />
        <EdgeLabel x={510} y={285} anchor="start">Admin schválí</EdgeLabel>
        <EdgeLabel x={510} y={313} anchor="start" muted>znovu ověří BR-02 + BR-05</EdgeLabel>
      </DiagramRegion>

      <DiagramRegion id="endings">
        <path className="edge" d="M660 128 C 860 128, 900 48, 1108 48" markerEnd={a} />
        <EdgeLabel x={730} y={72}>Admin zamítne</EdgeLabel>
        <StateBox x={1110} y={8} w={330} label="REJECTED" fill="#e11d48" />
        <path className="edge" d="M660 160 C 860 160, 900 220, 1108 220" markerEnd={a} />
        <EdgeLabel x={880} y={232}>now ≥ startTime</EdgeLabel>
        <StateBox x={1110} y={180} w={330} label="EXPIRED" fill="#7c3aed" />
        <path className="edge" d="M640 185 C 900 240, 940 412, 1108 412" markerEnd={a} />
        <EdgeLabel x={960} y={350} anchor="start">zruší vlastník / Admin</EdgeLabel>
      </DiagramRegion>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Mermaid source (C05 §6 detailed sequence)                           */
/* ------------------------------------------------------------------ */

export const MERMAID_CONFIG = {
  theme: 'base',
  fontFamily: 'Inter, system-ui, sans-serif',
  themeVariables: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '20px',
    background: '#f4f2ec',
    primaryColor: '#ffffff',
    primaryBorderColor: '#0e1116',
    primaryTextColor: '#0e1116',
    lineColor: '#2b303a',
    secondaryColor: '#ffffff',
    tertiaryColor: '#f4f2ec',
    noteBkgColor: '#fef3c7',
    noteBorderColor: '#d97706',
    actorBkg: '#ffffff',
    actorBorder: '#0e1116',
    signalColor: '#2b303a',
    signalTextColor: '#0e1116',
    labelBoxBkgColor: '#ffffff',
    labelBoxBorderColor: '#0e1116',
    altSectionBkgColor: '#ffffff',
    edgeLabelBackground: '#f4f2ec',
  },
  sequence: {
    useMaxWidth: true,
    mirrorActors: false,
    actorMargin: 140,
    messageMargin: 28,
    actorFontSize: 22,
    messageFontSize: 22,
    noteFontSize: 22,
  },
}

export const NO_REGIONS: Record<string, string> = {}

export const SEQUENCE_CHART = `sequenceDiagram
  participant H as Decision Route Handler
  participant S as Reservation Service
  participant P as Reservation Policy
  participant DB as Prisma tx · SQLite
  H->>S: decideReservation(id, APPROVE, now)
  S->>DB: begin tx · načti PENDING Reservation + Agent
  S->>P: planDecision(…) → CONFIRM_CHECKS
  S->>DB: findConfirmedOverlap(overlapBounds(interval))
  DB-->>S: nalezena překrývající se CONFIRMED
  S->>P: assertCanConfirm(active, overlap)
  P-->>S: throw AGENT_UNAVAILABLE
  S->>DB: rollback · zůstává PENDING_APPROVAL
  S-->>H: ReservationRuleViolation
  Note over H: apiErrorResponse → 409 AGENT_UNAVAILABLE`
