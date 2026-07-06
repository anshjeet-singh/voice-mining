import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  Copy,
  Download,
  Filter,
  FolderPlus,
  Folders,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  Vault as VaultIcon,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const CONTENT_TYPE_LABELS: Record<string, string> = {
  hook: "Hook",
  email: "Email",
  skool_post: "Skool Post",
  ad_copy: "Ad Copy",
  script: "Script",
  youtube_idea: "YouTube Idea",
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  hook: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  email: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  skool_post: "text-green-400 bg-green-400/10 border-green-400/20",
  ad_copy: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  script: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  youtube_idea: "text-red-400 bg-red-400/10 border-red-400/20",
};

export default function Vault() {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [activeCollection, setActiveCollection] = useState<number | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tagEditId, setTagEditId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.vault.list.useQuery();
  const { data: collections } = trpc.vault.collections.list.useQuery();

  // Optimistic delete: remove from cache immediately, roll back on error
  const deleteMutation = trpc.vault.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.vault.list.cancel();
      const previous = utils.vault.list.getData();
      utils.vault.list.setData(undefined, (old) => (old ?? []).filter((i) => i.id !== id));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) utils.vault.list.setData(undefined, context.previous);
      toast.error("Could not delete that item");
    },
    onSettled: () => utils.vault.list.invalidate(),
  });

  const deleteManyMutation = trpc.vault.deleteMany.useMutation({
    onMutate: async ({ ids }) => {
      await utils.vault.list.cancel();
      const previous = utils.vault.list.getData();
      const idSet = new Set(ids);
      utils.vault.list.setData(undefined, (old) => (old ?? []).filter((i) => !idSet.has(i.id)));
      return { previous };
    },
    onSuccess: (_data, { ids }) => {
      toast.success(`Deleted ${ids.length} items`);
      setSelectedIds(new Set());
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) utils.vault.list.setData(undefined, context.previous);
      toast.error("Bulk delete failed");
    },
    onSettled: () => utils.vault.list.invalidate(),
  });

  const updateMutation = trpc.vault.update.useMutation({
    onSuccess: () => utils.vault.list.invalidate(),
    onError: () => toast.error("Could not update that item"),
  });

  const createCollectionMutation = trpc.vault.collections.create.useMutation({
    onSuccess: () => {
      utils.vault.collections.list.invalidate();
      setNewCollectionName("");
      setNewCollectionOpen(false);
      toast.success("Collection created");
    },
    onError: () => toast.error("Could not create collection"),
  });

  const deleteCollectionMutation = trpc.vault.collections.delete.useMutation({
    onSuccess: () => {
      utils.vault.collections.list.invalidate();
      utils.vault.list.invalidate();
      setActiveCollection("all");
    },
  });

  const handleCopy = (content: string, id: number) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredItems = useMemo(
    () =>
      (items ?? []).filter((item) => {
        const matchesFilter = activeFilter === "all" || item.contentType === activeFilter;
        const matchesCollection = activeCollection === "all" || item.collectionId === activeCollection;
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          !q ||
          item.label.toLowerCase().includes(q) ||
          item.content.toLowerCase().includes(q) ||
          item.searchKeyword.toLowerCase().includes(q) ||
          (item.tags ?? []).some((t) => t.toLowerCase().includes(q));
        return matchesFilter && matchesCollection && matchesSearch;
      }),
    [items, activeFilter, activeCollection, searchQuery]
  );

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id));

  const exportAll = () => {
    const source = filteredItems.length > 0 ? filteredItems : items ?? [];
    if (source.length === 0) {
      toast.error("Nothing to export yet");
      return;
    }
    const rows = [["Type", "Keyword", "Label", "Tags", "Content", "Saved"]];
    for (const item of source) {
      rows.push([
        CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType,
        item.searchKeyword,
        item.label,
        (item.tags ?? []).join("; "),
        item.content.replace(/\n/g, " "),
        new Date(item.createdAt).toISOString().slice(0, 10),
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vault-export.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${source.length} items as CSV`);
  };

  const saveTags = (id: number) => {
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
    updateMutation.mutate({ id, tags });
    setTagEditId(null);
    setTagInput("");
  };

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "hook", label: "Hooks" },
    { key: "email", label: "Emails" },
    { key: "skool_post", label: "Skool Posts" },
    { key: "ad_copy", label: "Ad Copy" },
    { key: "script", label: "Scripts" },
    { key: "youtube_idea", label: "YouTube Ideas" },
  ];

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Vault</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your saved hooks, emails, posts, and scripts
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={exportAll} className="border-border/50 text-muted-foreground hover:text-foreground">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export All
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <VaultIcon className="w-4 h-4" />
              <span>{(items ?? []).length} saved</span>
            </div>
          </div>
        </div>

        {/* Collections row */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
          <Folders className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 mr-1" />
          <button
            onClick={() => setActiveCollection("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 border ${
              activeCollection === "all"
                ? "bg-primary/15 text-primary border-primary/30"
                : "text-muted-foreground hover:text-foreground border-transparent hover:bg-card/60"
            }`}
          >
            All Collections
          </button>
          {(collections ?? []).map((c) => (
            <div key={c.id} className="flex items-center flex-shrink-0">
              <button
                onClick={() => setActiveCollection(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                  activeCollection === c.id
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:bg-card/60"
                }`}
              >
                {c.name}
              </button>
              {activeCollection === c.id && (
                <button
                  onClick={() => deleteCollectionMutation.mutate({ id: c.id })}
                  className="p-1 text-muted-foreground/50 hover:text-red-400 transition-colors"
                  title="Delete collection (items stay in the vault)"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {newCollectionOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newCollectionName.trim()) createCollectionMutation.mutate({ name: newCollectionName.trim() });
              }}
              className="flex items-center gap-1 flex-shrink-0"
            >
              <input
                autoFocus
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="e.g. Q4 Campaign"
                className="w-32 px-2 py-1.5 text-xs bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
              />
              <button type="submit" className="p-1.5 text-primary" title="Create collection">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setNewCollectionOpen(false)} className="p-1.5 text-muted-foreground" title="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setNewCollectionOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 hover:border-primary/30 transition-all flex-shrink-0"
            >
              <FolderPlus className="w-3 h-3" />
              New Collection
            </button>
          )}
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search saved items and tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
          <Filter className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0 mr-1" />
          {filterTabs.map((tab) => {
            const count = tab.key === "all"
              ? (items ?? []).length
              : (items ?? []).filter((i) => i.contentType === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 flex-shrink-0 ${
                  activeFilter === tab.key
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60 border border-transparent"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeFilter === tab.key ? "bg-primary/20 text-primary" : "bg-card text-muted-foreground/60"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bulk actions bar */}
        {filteredItems.length > 0 && (
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              onClick={() => {
                setSelectedIds(allFilteredSelected ? new Set() : new Set(filteredItems.map((i) => i.id)));
              }}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                allFilteredSelected ? "border-primary bg-primary" : "border-border/60"
              }`}>
                {allFilteredSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
              </div>
              {allFilteredSelected ? "Deselect all" : "Select all"}
            </button>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                {activeCollection === "all" && (collections?.length ?? 0) > 0 && (
                  <select
                    onChange={(e) => {
                      const collectionId = parseInt(e.target.value);
                      if (!isNaN(collectionId)) {
                        for (const id of Array.from(selectedIds)) updateMutation.mutate({ id, collectionId });
                        toast.success(`Moved ${selectedIds.size} items to collection`);
                        setSelectedIds(new Set());
                      }
                      e.target.value = "";
                    }}
                    defaultValue=""
                    className="px-2 py-1.5 text-xs bg-card/50 border border-border/50 rounded-lg text-muted-foreground focus:outline-none"
                  >
                    <option value="" disabled>Move to collection...</option>
                    {(collections ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteManyMutation.mutate({ ids: Array.from(selectedIds) })}
                  disabled={deleteManyMutation.isPending}
                  className="border-red-400/30 text-red-400 hover:bg-red-400/10 h-8"
                >
                  {deleteManyMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-1.5" />
                  )}
                  Delete {selectedIds.size}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-xl border border-border/40 bg-card/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-2/3 mb-2" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <VaultIcon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {searchQuery || activeFilter !== "all" || activeCollection !== "all" ? "No items match your filter" : "Your vault is empty"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {searchQuery || activeFilter !== "all" || activeCollection !== "all"
                ? "Try adjusting your search, filter, or collection"
                : "Save hooks, emails, posts, and scripts from your reports by clicking the bookmark icon"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const typeColor = CONTENT_TYPE_COLORS[item.contentType] ?? "text-muted-foreground bg-card border-border/50";
              const typeLabel = CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType;
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    isSelected ? "border-primary/40 bg-primary/5" : "border-border/40 bg-card/30 hover:bg-card/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        onClick={() => toggleSelected(item.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected ? "border-primary bg-primary" : "border-border/60 hover:border-primary/50"
                        }`}
                        title={isSelected ? "Deselect" : "Select"}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </button>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeColor}`}>
                        {typeLabel}
                      </span>
                      <span className="text-xs text-muted-foreground/60">
                        {item.searchKeyword}
                      </span>
                      {(item.tags ?? []).map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-card/60 border border-border/40 text-muted-foreground flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => {
                          setTagEditId(tagEditId === item.id ? null : item.id);
                          setTagInput((item.tags ?? []).join(", "));
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-all"
                        title="Edit tags"
                      >
                        <Tag className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleCopy(item.content, item.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-all"
                        title="Copy to clipboard"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate({ id: item.id })}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all"
                        title="Remove from vault"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {tagEditId === item.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveTags(item.id);
                      }}
                      className="flex items-center gap-2 mb-3"
                    >
                      <input
                        autoFocus
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="Comma-separated tags, e.g. launch, q4, top-performer"
                        className="flex-1 px-3 py-1.5 text-xs bg-card/50 border border-border/50 rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                      />
                      <button type="submit" className="p-1.5 text-primary" title="Save tags">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  )}

                  <p className="text-xs font-medium text-foreground mb-2">{item.label}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
                    {item.content}
                  </p>
                  <p className="text-xs text-muted-foreground/40 mt-2">
                    Saved {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
