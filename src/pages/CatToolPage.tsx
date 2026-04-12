/**
 * Embeds the vanilla CAT app from /cat/index.html (see cat-tool/ → public/cat via npm run sync:cat).
 */
export default function CatToolPage() {
  const src = `${import.meta.env.BASE_URL}cat/index.html`;
  return (
    <div className="-m-6 flex min-h-0 flex-1 flex-col" style={{ minHeight: "calc(100vh - 3rem)" }}>
      <iframe title="CAT（建構中）" src={src} className="min-h-0 w-full flex-1 border-0 bg-background" />
    </div>
  );
}
