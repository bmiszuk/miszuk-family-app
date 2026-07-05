import { useEffect, useState } from "react";

const STORAGE_KEY = "miszuk-grocery-list";

export default function GroceryList() {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setItems(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function addItem() {
    if (!text.trim()) return;

    setItems([
      ...items,
      {
        id: Date.now(),
        name: text.trim(),
        done: false,
      },
    ]);

    setText("");
  }

  function toggle(id) {
    setItems(
      items.map((item) =>
        item.id === id
          ? { ...item, done: !item.done }
          : item
      )
    );
  }

  function remove(id) {
    setItems(items.filter((item) => item.id !== id));
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          value={text}
          placeholder="Add grocery item..."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />

        <button onClick={addItem}>Add</button>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <input
            type="checkbox"
            checked={item.done}
            onChange={() => toggle(item.id)}
          />

          <span
            style={{
              flex: 1,
              marginLeft: 10,
              textDecoration: item.done
                ? "line-through"
                : "none",
            }}
          >
            {item.name}
          </span>

          <button onClick={() => remove(item.id)}>
            ✕
          </button>
        </div>
      ))}
    </>
  );
}