// src/pages/AboutPage.tsx
// ============================================================================
// DollarDex — About page
// - Premium, calm, trust-focused layout
// - Uses existing CSS system: wrap, card, chip, dot, small
// - No wallet logic here (read-only page)
// - Safe in DEV + preview
// ============================================================================

export default function AboutPage() {
  return (
    <div className="yf-luxe">
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 18 }}>
        {/* Header */}
        <div className="card">
          <div style={{ maxWidth: 820 }}>
            <div className="small" style={{ letterSpacing: ".22em", textTransform: "uppercase" }}>
              About DollarDex
            </div>

            <h1 style={{ marginTop: 10, marginBottom: 6 }}>
              Built for longevity. Designed for clarity.
            </h1>

            <div className="small">
              DollarDex is a professionally structured on-chain earning protocol focused on sustainability,
              transparency, and predictable mechanics.
            </div>
          </div>
        </div>

        {/* Philosophy */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 14
          }}
        >
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Our philosophy</h3>
            <div className="small" style={{ marginTop: 8 }}>
              We avoid exaggerated promises and instead focus on:
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "grid", gap: 10 }}>
              <span className="chip">
                <span className="dot" /> Sustainable daily mechanics
              </span>
              <span className="chip">
                <span className="dot" /> Transparent smart contracts
              </span>
              <span className="chip">
                <span className="dot" /> Verifiable on-chain data
              </span>
              <span className="chip">
                <span className="dot" /> Long-term protocol health
              </span>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>What DollarDex is not</h3>
            <div className="small" style={{ marginTop: 8 }}>
              To be clear, DollarDex does not:
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "grid", gap: 10 }}>
              <span className="chip">
                <span className="dot" /> Promise guaranteed profits
              </span>
              <span className="chip">
                <span className="dot" /> Use hidden or upgradeable contracts
              </span>
              <span className="chip">
                <span className="dot" /> Control user funds
              </span>
              <span className="chip">
                <span className="dot" /> Request private keys or seed phrases
              </span>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>How it works</h3>

          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12
            }}
          >
            <div className="card">
              <div className="small">Step 1</div>
              <div style={{ fontWeight: 1000, marginTop: 6 }}>Deposit</div>
              <div className="small" style={{ marginTop: 6 }}>
                Users deposit USDT directly into the smart contract.
              </div>
            </div>

            <div className="card">
              <div className="small">Step 2</div>
              <div style={{ fontWeight: 1000, marginTop: 6 }}>Position creation</div>
              <div className="small" style={{ marginTop: 6 }}>
                Each deposit creates a new, verifiable on-chain position.
              </div>
            </div>

            <div className="card">
              <div className="small">Step 3</div>
              <div style={{ fontWeight: 1000, marginTop: 6 }}>Daily accrual</div>
              <div className="small" style={{ marginTop: 6 }}>
                Rewards accrue daily based on fixed protocol rules.
              </div>
            </div>

            <div className="card">
              <div className="small">Step 4</div>
              <div style={{ fontWeight: 1000, marginTop: 6 }}>Claim or compound</div>
              <div className="small" style={{ marginTop: 6 }}>
                Users may claim or compound rewards according to protocol limits.
              </div>
            </div>
          </div>
        </div>

        {/* Transparency */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: 14
          }}
        >
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Transparency</h3>
            <div className="small" style={{ marginTop: 8 }}>
              All important data is publicly verifiable:
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "grid", gap: 10 }}>
              <span className="chip">
                <span className="dot" /> Contract balance
              </span>
              <span className="chip">
                <span className="dot" /> Total deposits and withdrawals
              </span>
              <span className="chip">
                <span className="dot" /> Individual user positions
              </span>
              <span className="chip">
                <span className="dot" /> Reward calculations
              </span>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Responsibility</h3>
            <div className="small" style={{ marginTop: 8 }}>
              Participation in any on-chain protocol carries risk. Users are responsible for:
            </div>

            <div style={{ height: 12 }} />

            <div style={{ display: "grid", gap: 10 }}>
              <span className="chip">
                <span className="dot" /> Understanding how the protocol works
              </span>
              <span className="chip">
                <span className="dot" /> Managing their own wallets
              </span>
              <span className="chip">
                <span className="dot" /> Evaluating personal risk tolerance
              </span>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="card" style={{ marginTop: 14 }}>
          <div className="small">
            DollarDex is an autonomous smart contract system deployed on BSC Mainnet.
            No central party controls user funds. Always verify addresses and transactions independently.
          </div>
        </div>
      </div>
    </div>
  );
}
