function renderState(icon, iconClass, title, text, actions) {
      const card = document.getElementById('cancelCard');
      card.innerHTML = `
        <div class="cancel-icon ${iconClass}"><i class="fa-solid ${icon}"></i></div>
        <h1 class="cancel-title">${title}</h1>
        <p class="cancel-text">${text}</p>
        <div class="cancel-actions">${actions || ''}</div>
      `;
    }

    async function cancelBooking() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        renderState(
          'fa-circle-exclamation',
          'error',
          'Lien invalide',
          'Ce lien d\'annulation est incomplet ou invalide. Contactez-nous directement si vous souhaitez annuler votre rendez-vous.',
          '<a class="cancel-btn" href="/">Retour à l\'accueil</a>'
        );
        return;
      }

      try {
        const response = await fetch('/api/bookings/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          renderState(
            'fa-circle-check',
            'success',
            'Rendez-vous annulé',
            'Votre rendez-vous a bien été annulé. Vous pouvez réserver un nouveau créneau à tout moment.',
            '<a class="cancel-btn" href="/#reservation">Réserver un nouveau créneau</a>'
          );
        } else if (response.status === 409) {
          renderState(
            'fa-circle-info',
            'error',
            'Déjà annulé',
            'Ce rendez-vous a déjà été annulé précédemment. Aucune action supplémentaire n\'est nécessaire.',
            '<a class="cancel-btn secondary" href="/">Retour à l\'accueil</a>'
          );
        } else {
          renderState(
            'fa-circle-exclamation',
            'error',
            'Réservation introuvable',
            data.message || 'Nous n\'avons pas trouvé de rendez-vous correspondant à ce lien. Contactez-nous si besoin.',
            '<a class="cancel-btn secondary" href="/">Retour à l\'accueil</a>'
          );
        }
      } catch (error) {
        renderState(
          'fa-triangle-exclamation',
          'error',
          'Erreur de connexion',
          'Impossible de contacter le serveur pour le moment. Réessayez dans quelques instants.',
          '<a class="cancel-btn secondary" href="/">Retour à l\'accueil</a>'
        );
      }
    }

    cancelBooking();
