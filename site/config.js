// Public settings. Nothing here is secret: the anon key only lets the page run
// Google sign-in, and the database refuses it. Every score goes through the api
// function, which checks who you are on each request.
window.AWG_CONFIG = Object.freeze({
  api: 'https://iqvwxhxkoznehopjrpqz.supabase.co/functions/v1/api',
  supabaseUrl: 'https://iqvwxhxkoznehopjrpqz.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxdnd4aHhrb3puZWhvcGpycHF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NDg5MTUsImV4cCI6MjExMDIyNDkxNX0.9xZwLFgc0vcYiocaChza4CYThKZYBoMy01ChkpIcFP8'
});
