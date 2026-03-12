import { supabase } from "@/integrations/supabase/client";
import { getEnvironment } from "@/lib/environment";

export interface IconLibraryItem {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  createdAt: string;
}

type Listener = () => void;

let items: IconLibraryItem[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function notify() { listeners.forEach((l) => l()); }

function fromDb(row: any): IconLibraryItem {
  return {
    id: row.id,
    name: row.name ?? "",
    url: row.url ?? "",
    storagePath: row.storage_path ?? "",
    createdAt: row.created_at,
  };
}

async function load() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const env = getEnvironment();
    const { data } = await supabase
      .from("icon_library" as any)
      .select("*")
      .eq("env", env)
      .order("created_at", { ascending: false });
    items = (data || []).map(fromDb);
    loaded = true;
    notify();
  })();
  loadPromise.finally(() => { loadPromise = null; });
  return loadPromise;
}

function getAll(): IconLibraryItem[] {
  if (!loaded) load();
  return items;
}

async function add(name: string, url: string, storagePath: string): Promise<IconLibraryItem> {
  const env = getEnvironment();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("icon_library" as any)
    .insert({ name, url, storage_path: storagePath, env, created_by: userData.user?.id } as any)
    .select()
    .single();
  if (error) throw error;
  const item = fromDb(data);
  items = [item, ...items];
  notify();
  return item;
}

async function update(id: string, updates: { name?: string }) {
  const map: any = {};
  if (updates.name !== undefined) map.name = updates.name;
  map.updated_at = new Date().toISOString();
  const { error } = await supabase
    .from("icon_library" as any)
    .update(map)
    .eq("id", id);
  if (error) throw error;
  items = items.map((it) => it.id === id ? { ...it, ...updates } : it);
  notify();
}

async function remove(id: string) {
  const item = items.find((it) => it.id === id);
  if (item?.storagePath) {
    await supabase.storage.from("case-icons").remove([item.storagePath]);
  }
  const { error } = await supabase
    .from("icon_library" as any)
    .delete()
    .eq("id", id);
  if (error) throw error;
  items = items.filter((it) => it.id !== id);
  notify();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const iconLibraryStore = { load, getAll, add, update, remove, subscribe };
