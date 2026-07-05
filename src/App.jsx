import "./index.css";

function Card({ title, children }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <div className="page">
      <header className="hero">
        <h1>🏡 Miszuk Family</h1>
        <p>Welcome home.</p>
      </header>

      <div className="grid">
        <Card title="🛒 Grocery List">
          <p>Coming soon...</p>
        </Card>

        <Card title="📢 Family News">
          <p>No announcements.</p>
        </Card>

        <Card title="📅 Calendar">
          <p>No upcoming events.</p>
        </Card>

        <Card title="🏠 House Projects">
          <p>Track projects here.</p>
        </Card>

        <Card title="📷 Photos">
          <p>Family memories.</p>
        </Card>

        <Card title="📄 Documents">
          <p>Shared documents.</p>
        </Card>
      </div>
    </div>
  );
}