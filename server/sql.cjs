// node sql.cjs <datei.sql | "SQL"> – nutzt SUPABASE_ACCESS_TOKEN (aus .secrets/supabase_token.env)
const fs=require('fs');const {execFileSync}=require('child_process');
const a=process.argv[2];const sql=fs.existsSync(a)?fs.readFileSync(a,'utf8'):a;
if(!process.env.SUPABASE_ACCESS_TOKEN){console.error('SUPABASE_ACCESS_TOKEN fehlt – . /workspace/responsible/.secrets/supabase_token.env');process.exit(2)}
const o=execFileSync('curl',['-s','-w','\n%{http_code}','-X','POST','https://api.supabase.com/v1/projects/wlujgkbtpjxuekwsgnmg/database/query','-H','Authorization: Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'-H','Content-Type: application/json','-d','@-'],{input:JSON.stringify({query:sql})}).toString();
const i=o.lastIndexOf('\n');const body=o.slice(0,i),code=+o.slice(i+1);
console.log(body);if(code>=300){console.error('HTTP '+code);process.exit(1)}
