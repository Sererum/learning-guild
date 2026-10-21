// Scene coordinates are shared by the outfit and every equipment layer.
// Keep source-pixel pivots here, never in screen-size-dependent CSS.
const icon=(id,anchor,scale,pivot=[256,256],extra={})=>({asset:'/assets/item-'+id+'-v1.webp',width:512,height:512,pivot,anchor,scale,layer:'front',...extra});
const weapon=(id,pivot,scale)=>({asset:'/assets/equipment/worn-'+id+'-v1.png',width:1024,height:1536,pivot,anchor:'weapon',scale,layer:'behind',occlusion:'portrait-closed-fist'});
export const equipmentManifest={
 schemaVersion:1,poseId:'scholar-hold-v1',canvas:{width:480,height:700},
 portrait:{width:1024,height:1536,scene:{x:20/3,y:0,width:1400/3,height:700},reference:'hero-outfit-novice-v4.png'},
 anchors:{weapon:{x:401.8,y:268.4},flower:{x:186,y:151},feather:{x:223,y:220,angle:17},clock:{x:257,y:216,angle:-7},ribbon:{x:285,y:84,angle:12},pin:{x:227,y:115},crown:{x:232,y:39}},
 outfits:Object.fromEntries(['novice','tea','sea','violet','cloud','moon','peony','aurora','ember'].map(id=>[id,{asset:'hero-outfit-'+id+'-v4.png',private:true,poseId:'scholar-hold-v1',anchors:{}}])),
 // Neutral vector fallback uses its own fixed geometry, never painted anchors.
 neutralAnchors:{weapon:{x:346,y:356},flower:{x:202,y:161},feather:{x:220,y:239},clock:{x:262,y:234},ribbon:{x:280,y:69},pin:{x:240,y:149},crown:{x:241,y:31}},
 grips:{},items:{
  quill:weapon('quill',[512,1245],.205),
  'archive-quill':weapon('archive-quill',[512,1240],.17),
  'moon-quill':weapon('moon-quill',[512,1215],.205),
  'dawn-quill':weapon('dawn-quill',[512,760],.32),
  flower:icon('flower','flower',.067),garden:icon('garden','flower',.068),bloom:icon('bloom','flower',.071),
  feather:icon('feather','feather',.092,[102,418]),ink:icon('ink','feather',.091,[102,418]),tide:icon('tide','feather',.094,[102,418]),
  clock:icon('clock','clock',.075,[305,48]),eternity:icon('eternity','clock',.077,[305,48]),eclipse:icon('eclipse','clock',.079,[305,48]),
  ribbon:icon('ribbon','ribbon',.10,[256,150]),pin:icon('pin','pin',.049),
  ...Object.fromEntries([["wreath",1774,887,887,750,0.052],["star",1897,829,948.5,780,0.048],["halo",1881,836,940.5,800,0.048],["coral",1896,830,948,790,0.048],["comet",1902,827,951,775,0.048]].map(([id,width,height,px,py,scale])=>[id,{asset:'/assets/equipment/worn-'+id+'-v1.png',width,height,pivot:[px,py],anchor:'crown',scale,layer:'front'}]))
 }
};
