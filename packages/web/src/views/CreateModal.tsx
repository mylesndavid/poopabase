import React, { useState } from "react";
import { Button, Icon, Kbd } from "../ui";

const TEMPLATES = [
  { name: "Blank", desc: "Empty database", emoji: "📄" },
  { name: "Todo app", desc: "tasks + projects", emoji: "✅" },
  { name: "SaaS", desc: "users + orgs + billing", emoji: "💳" },
  { name: "AI memory", desc: "documents + embeddings", emoji: "🧠" },
];

export function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = () => {
    if (name.trim()) onCreate(name.trim());
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[440px] overflow-hidden rounded-xl border border-borderhi bg-elevated shadow-pop animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-[15px] font-semibold">New database</h3>
          <button onClick={onClose} className="text-subtle hover:text-text">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="my-app"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted">Start from</label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setName(t.name === "Blank" ? name : t.name.toLowerCase().replace(/\s+/g, "-"))}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left hover:border-borderhi"
                >
                  <span className="text-lg">{t.emoji}</span>
                  <div>
                    <div className="text-[13px] font-medium">{t.name}</div>
                    <div className="text-[11px] text-subtle">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3.5">
          <span className="text-[11px] text-subtle">
            Created instantly · streamed to the cloud
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={!name.trim()}>
              Create <Kbd>↵</Kbd>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
