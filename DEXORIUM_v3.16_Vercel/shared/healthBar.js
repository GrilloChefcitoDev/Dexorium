// Decide la clase CSS de una barra según los puntos de vida restantes.
// Se mantiene en una función pequeña para que sea fácil de leer y probar.
export function getHealthBarClass(currentHp, maxHp) {
  const safeMaxHp = Math.max(1, Number(maxHp) || 1);
  const safeCurrentHp = Math.max(0, Number(currentHp) || 0);
  const healthRatio = Math.min(1, safeCurrentHp / safeMaxHp);

  if (healthRatio <= 0.2) return 'hp-critical';
  if (healthRatio <= 0.5) return 'hp-low';
  return 'hp-healthy';
}
