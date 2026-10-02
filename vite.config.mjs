import {defineConfig} from 'vite';
export default defineConfig({base:'./',server:{port:5176,strictPort:true,proxy:{'/api':'http://127.0.0.1:3003'}}});
