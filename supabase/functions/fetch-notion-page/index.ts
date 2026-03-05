const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { page_id } = await req.json();
    if (!page_id) {
      return new Response(JSON.stringify({ error: 'page_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const notionToken = Deno.env.get('NOTION_API_TOKEN');
    if (!notionToken) {
      return new Response(JSON.stringify({ error: 'NOTION_API_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };

    // Try as page first
    let res = await fetch(`https://api.notion.com/v1/pages/${page_id}`, { headers });

    if (!res.ok) {
      const errBody = await res.text();

      // If it's a database, not a page — return 200 with error so client can read it
      if (errBody.includes('is a database')) {
        console.error('Provided ID is a database, not a page.');
        return new Response(JSON.stringify({
          error: '請貼上案件頁面的連結，而非資料庫的連結。請在 Notion 中開啟單一案件後，複製該頁面的 URL。',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.error('Notion API error:', res.status, errBody);
      return new Response(JSON.stringify({ error: `Notion API error: ${res.status}`, details: errBody }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const page = await res.json();
    const props = page.properties || {};

    // --- Extract helpers ---
    const extractTitle = (prop: any): string => {
      if (!prop || prop.type !== 'title' || !Array.isArray(prop.title)) return '';
      return prop.title.map((t: any) => t.plain_text).join('');
    };
    const extractMultiSelect = (prop: any): string[] => {
      if (!prop || prop.type !== 'multi_select') return [];
      return prop.multi_select.map((s: any) => s.name);
    };
    const extractSelect = (prop: any): string => {
      if (!prop || prop.type !== 'select' || !prop.select) return '';
      return prop.select.name;
    };
    const extractPeople = (prop: any): { name: string; email?: string }[] => {
      if (!prop || prop.type !== 'people') return [];
      return prop.people.map((p: any) => ({
        name: p.name || p.id,
        email: p.person?.email || undefined,
      }));
    };
    const extractDate = (prop: any): string => {
      if (!prop || prop.type !== 'date' || !prop.date) return '';
      return prop.date.start || '';
    };
    const extractNumber = (prop: any): number | null => {
      if (!prop || prop.type !== 'number') return null;
      return prop.number;
    };
    const extractRichText = (prop: any): string => {
      if (!prop || prop.type !== 'rich_text') return '';
      return (prop.rich_text || []).map((t: any) => t.plain_text).join('');
    };

    // Build result
    const result: Record<string, any> = {
      notionPageId: page_id,
      notionUrl: page.url,
    };

    for (const [key, value] of Object.entries(props)) {
      const prop = value as any;
      switch (prop.type) {
        case 'title':
          result[key] = extractTitle(prop);
          break;
        case 'select':
          result[key] = extractSelect(prop);
          break;
        case 'multi_select':
          result[key] = extractMultiSelect(prop);
          break;
        case 'people':
          result[key] = extractPeople(prop);
          break;
        case 'date':
          result[key] = extractDate(prop);
          break;
        case 'number':
          result[key] = extractNumber(prop);
          break;
        case 'rich_text':
          result[key] = extractRichText(prop);
          break;
        case 'status':
          result[key] = prop.status?.name || '';
          break;
        default:
          break;
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
