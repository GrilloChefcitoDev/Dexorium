import { useEffect } from 'react';

// Guía de inicio pensada para quien nunca ha jugado Pokémon ni una batalla por turnos.
export default function HowToPlay({ onClose }) {
  useEffect(() => {
    function closeWithEscape(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onClose]);

  return (
    <div
      className="howto-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="howto-panel" role="dialog" aria-modal="true" aria-labelledby="howto-title">
        <header className="howto-heading">
          <div className="howto-heading-mark" aria-hidden="true">📘</div>
          <div>
            <p className="eyebrow">DEXORIUM · GUÍA PARA PRINCIPIANTES</p>
            <h2 id="howto-title">Cómo jugar y participar</h2>
            <p>No hace falta conocer Pokémon de antemano. Sigue estos pasos para empezar.</p>
          </div>
          <button type="button" className="howto-close" onClick={onClose} aria-label="Cerrar manual">×</button>
        </header>

        <div className="howto-content">
          <article className="howto-step">
            <span>1</span>
            <div>
              <h3>Prepara tu equipo</h3>
              <p>Entra a la Pokédex, busca Pokémon por nombre o número y revisa sus datos. Después elige <strong>6 Pokémon distintos</strong>. Puedes quitar uno y escoger otro antes de continuar; no necesitas memorizar sus nombres ni tipos.</p>
            </div>
          </article>

          <article className="howto-step">
            <span>2</span>
            <div>
              <h3>Crea una sala o únete a una</h3>
              <p>Escribe el nombre de entrenador. <strong>1v1</strong> necesita dos jugadores; <strong>DUOS</strong> necesita cuatro, en dos equipos. Una sala pública aparece en la lista. Para una privada, comparte el código y, si pusiste una, la contraseña.</p>
            </div>
          </article>

          <article className="howto-step">
            <span>3</span>
            <div>
              <h3>Elige una acción en cada turno</h3>
              <p>Cuando comience el combate, escoge qué hará tu Pokémon y envía la jugada. Después se resuelven las acciones del turno. Mira siempre los puntos de vida (PS/HP) y la energía antes de elegir.</p>
              <ul>
                <li><strong>Atacar:</strong> hace daño al rival y consume energía.</li>
                <li><strong>Defender:</strong> crea protección para el Pokémon elegido.</li>
                <li><strong>Curar:</strong> recupera vida de un aliado.</li>
                <li><strong>Recargar energía:</strong> recupera energía para usar más acciones.</li>
                <li><strong>Cambiar:</strong> manda al combate a otro Pokémon que siga con vida.</li>
              </ul>
            </div>
          </article>

          <article className="howto-step">
            <span>4</span>
            <div>
              <h3>Usa las mecánicas especiales con cuidado</h3>
              <p>La <strong>Transformación</strong> ofrece las formas disponibles para ese Pokémon, por ejemplo Mega-Evolución, Dinamax o Gigamax. La <strong>Teracristalización</strong> cambia su tipo y habilita Tera Golpe. <strong>Un mismo Pokémon solo puede usar una de estas mecánicas en el combate</strong>: si ya se transformó, no puede teracristalizarse; si se teracristalizó, no puede usar Dinamax ni otra transformación. El equipo solo puede usar Tera una vez por combate; Dinamax y Gigamax tienen sus propios usos limitados por equipo.
              </p>
            </div>
          </article>

          <article className="howto-step">
            <span>5</span>
            <div>
              <h3>Cuida la vida y gana el combate</h3>
              <p>Si un Pokémon llega a <strong>0 PS/HP</strong>, queda fuera de combate y tendrás que elegir otro que siga vivo. Gana el equipo que conserve Pokémon disponibles cuando el rival ya no tenga ninguno. También puedes rendirte, pero eso cuenta como derrota.</p>
            </div>
          </article>

          <article className="howto-step">
            <span>6</span>
            <div>
              <h3>¿Qué pasa con los Pokémon al terminar?</h3>
              <p>Para preparar una revancha, se bloquean los Pokémon que llegaron a 0 PS. Transformar a un Pokémon que sigue vivo <strong>no lo bloquea por sí solo</strong>. Si un jugador se rinde, su equipo cuenta como derrotado. Los Pokémon bloqueados aparecen marcados en la selección de la revancha.</p>
            </div>
          </article>

          <div className="howto-tip"><strong>Consejo:</strong> durante el combate puedes volver a abrir esta guía cuando quieras. Los botones muestran el coste de energía y las teclas rápidas disponibles.</div>
        </div>

        <footer className="howto-footer">
          <span>¡Listo! Ya sabes lo necesario para jugar tu primera partida.</span>
          <button type="button" className="primary-button" onClick={onClose}>Entendido, ¡a jugar!</button>
        </footer>
      </section>
    </div>
  );
}
