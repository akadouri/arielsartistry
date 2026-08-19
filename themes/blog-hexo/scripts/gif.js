hexo.extend.tag.register('gif', function(args) {
  const src = args[0];
  const poster = args[1] || '';
  
  return `
  <div style="position: relative; display: inline-block; max-width: 100%;">
    <video poster="${poster}" loop muted playsinline 
      onclick="this.paused ? this.play() : this.pause();"
      onplay="this.nextElementSibling.style.opacity='0';"
      onpause="this.nextElementSibling.style.opacity='1';"
      style="cursor: pointer; max-width: 100%; display: block;">
      <source src="${src}" type="video/mp4">
    </video>
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; background: rgba(0,0,0,0.65); border-radius: 50%; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s ease;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="white" style="margin-left: 3px;"><path d="M8 5v14l11-7z"/></svg>
    </div>
  </div>`;
});