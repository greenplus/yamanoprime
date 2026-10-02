for(const name of ['VITE_API_URL','VITE_AUTH_API_URL']){
  const value=process.env[name];
  if(!value)throw new Error(`${name} is required`);
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error(`${name} must be an HTTPS origin without credentials or /api`);
}
console.log('Public API origins validated.');
