/**
 * Presentation-only client hint. This value is NEVER used for authorization.
 * Telegram Desktop may report a compact WebView width, so its explicit
 * platform wins over CSS width. Web A/K and non-Telegram browsers use width.
 */
export type DeviceLayout='desktop'|'mobile';
export function deviceLayout(platform:string|undefined,viewportWidth:number):DeviceLayout{
 const name=String(platform||'').toLowerCase();
 if(name==='tdesktop'||name==='macos')return 'desktop';
 if(name==='android'||name==='ios')return 'mobile';
 return viewportWidth>=900?'desktop':'mobile';
}
export function clientPlatformLabel(platform:string|undefined):string{
 switch(String(platform||'').toLowerCase()){
  case 'tdesktop':return 'Telegram Desktop';
  case 'macos':return 'Telegram для macOS';
  case 'android':return 'Telegram Android';
  case 'ios':return 'Telegram iOS';
  case 'weba':return 'Telegram Web A';
  case 'web':case 'webk':return 'Telegram Web';
  default:return 'Веб-версия';
 }
}
