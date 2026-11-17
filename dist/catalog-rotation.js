export function createRotation(advance,{delay=5000,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  const blockers=new Set();let timer=null,disposed=false;
  function restart(){
    if(timer!==null)clearTimer(timer);
    timer=null;
    if(!disposed&&!blockers.size)timer=setTimer(()=>{timer=null;advance();restart();},delay);
  }
  restart();
  return {
    setPaused(reason,paused){paused?blockers.add(reason):blockers.delete(reason);restart();},
    restart,
    dispose(){disposed=true;restart();}
  };
}
