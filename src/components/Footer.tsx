const CONTRACT_ADDRESS = "0xd583327F81fA70d0f30A775dd7E0390B26E324cb";
const BSCSCAN = `https://bscscan.com/address/${CONTRACT_ADDRESS}`;
const VERSION = "v1.0.0";

export default function Footer() {
  return (
    <footer className="ddx-footer">
      <div className="wrap ddx-footer-inner">
        <div className="small">
          DollarDex · {VERSION}
        </div>

        <div className="ddx-footer-links">
          <a href={BSCSCAN} target="_blank" rel="noreferrer">
            Smart Contract
          </a>
        </div>
      </div>
    </footer>
  );
}
