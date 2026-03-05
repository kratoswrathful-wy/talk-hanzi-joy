import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Create the initial executive user
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: 'valodja.j@gmail.com',
    password: 'Redoct9901',
    email_confirm: true,
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // The trigger handle_new_user will create profile and assign 'member' role
  // Now upgrade to executive
  if (data.user) {
    await supabaseAdmin
      .from('user_roles')
      .update({ role: 'executive' })
      .eq('user_id', data.user.id)
  }

  return new Response(JSON.stringify({ success: true, userId: data.user?.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
