import "./chart-tokens.css";
import "../analysis.css";
import "../analysis-visual-wall.css";
import "../analysis-interactions.css";

const seedScript=`(()=>{try{
  const key="financial-app.analysis.visual-layout.v3";
  const order=["monthly-flow","net-trend","income-trend","expense-trend","savings-rate","expense-ratio","cumulative-net","net-diverging","income-prior","expense-prior","year-compare","annual-waterfall","rolling-expenses","rolling-net","expense-average","income-average","category-donut","category-bars","category-treemap","category-pareto","merchant-bars","merchant-pareto","deviations","monthly-heatmap"];
  const essential=["monthly-flow","net-trend","savings-rate","expense-ratio","cumulative-net","net-diverging","year-compare","annual-waterfall","rolling-expenses","monthly-heatmap"];
  const hidden=order.filter(id=>!essential.includes(id));
  const raw=localStorage.getItem(key);
  if(!raw){localStorage.setItem(key,JSON.stringify({order,hidden}));return;}
  const saved=JSON.parse(raw);
  const savedOrder=Array.isArray(saved?.order)?saved.order:[];
  const savedHidden=Array.isArray(saved?.hidden)?saved.hidden:[];
  const legacyDefault=savedOrder.length===order.length&&savedHidden.length===0&&order.every((id,index)=>savedOrder[index]===id);
  if(legacyDefault)localStorage.setItem(key,JSON.stringify({order,hidden}));
}catch{}})();`;

export default function Layout({children}:{children:React.ReactNode}){
  return <><script dangerouslySetInnerHTML={{__html:seedScript}}/>{children}</>;
}
