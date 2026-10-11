function renderState(icon, iconClass, title, text, actions) {
      const card = document.getElementById('verifyCard');
      card.innerHTML = `
        <div class="verify-icon ${iconClass}"><i class="fa-solid ${icon}"></i></div>
        <h1 class="verify-title">${title}</h1>
        <p class="verify-text">${text}</p>
        <div class="verify-actions">${actions || ''}</div>
      `;
    }

    async function verifyEmail() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        renderState(
          'fa-circle-exclamation',
          'error',
          'Lien invalide',
          'Ce lien de vérification est incomplet ou invalide.',
          '<a class="verify-btn" href="/">Retour à l\'accueil</a>'
        );
        return;
      }

      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          renderState(
            'fa-circle-check',
            'success',
            'Email vérifié',
            'Votre adresse email a bien été confirmée. Merci !',
            '<a class="verify-btn" href="/compte.html">Accéder à mon compte</a>'
          );
        } else if (response.status === 409) {
          renderState(
            'fa-circle-info',
            'error',
            'Déjà vérifié',
            'Cet email a déjà été confirmé précédemment. Aucune action supplémentaire n\'est nécessaire.',
            '<a class="verify-btn secondary" href="/compte.html">Accéder à mon compte</a>'
          );
        } else {
          renderState(
            'fa-circle-exclamation',
            'error',
            'Lien invalide ou expiré',
            data.message || 'Ce lien de vérification n\'est plus valide. Vous pouvez en demander un nouveau depuis votre espace client.',
            '<a class="verify-btn secondary" href="/compte.html">Accéder à mon compte</a>'
          );
        }
      } catch (error) {
        renderState(
          'fa-triangle-exclamation',
          'error',
          'Erreur de connexion',
          'Impossible de contacter le serveur pour le moment. Réessayez dans quelques instants.',
          '<a class="verify-btn secondary" href="/">Retour à l\'accueil</a>'
        );
      }
    }

    verifyEmail();
