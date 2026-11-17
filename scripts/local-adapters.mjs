import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir,readdir,stat,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export async function createLocalEnvironment(directory, origin='http://127.0.0.1:4173') {
  await mkdir(directory,{recursive:true});
  const sqlite=new DatabaseSync(path.join(directory,'inquiries.sqlite'));
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY);');
  const migrations=new URL('../drizzle/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(x=>x.endsWith('.sql')).sort()) {
    if(sqlite.prepare('SELECT name FROM __local_migrations WHERE name=?').get(name))continue;
    sqlite.exec('BEGIN');try{sqlite.exec(await readFile(new URL(name,migrations),'utf8'));sqlite.prepare('INSERT INTO __local_migrations VALUES (?)').run(name);sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}
  }
  const prepare=sql=>{
    let bindings=[];
    const statement={bind(...args){bindings=args;return statement;},async first(){return sqlite.prepare(sql).get(...bindings)||null;},async all(){return {results:sqlite.prepare(sql).all(...bindings),success:true};},async run(){const result=sqlite.prepare(sql).run(...bindings);return {success:true,meta:{changes:Number(result.changes)}};}};
    return statement;
  };
  const DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const bucketDir=path.join(directory,'photos');await mkdir(bucketDir,{recursive:true});
  const file=key=>path.join(bucketDir,createHash('sha256').update(key).digest('hex'));
  const BUCKET={async put(key,bytes){await writeFile(file(key),bytes);return {key};},async get(key){try{const data=await readFile(file(key));return {body:data};}catch(error){if(error.code==='ENOENT')return null;throw error;}},async head(key){try{return {size:(await stat(file(key))).size};}catch(error){if(error.code==='ENOENT')return null;throw error;}},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])try{await unlink(file(key));}catch(error){if(error.code!=='ENOENT')throw error;}}};
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url');
  return {env:{DB,BUCKET,SITE_ORIGIN:origin,ADMIN_USER_IDS:'local-owner',RATE_LIMIT_SALT:'local-only',CONFIG_ENCRYPTION_KEY:'0'.repeat(64),VAPID_PRIVATE_JWK:JSON.stringify(privateJwk),VAPID_PUBLIC_KEY:publicKey},sqlite,close:()=>sqlite.close()};
}
