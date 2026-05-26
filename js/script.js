document.addEventListener('DOMContentLoaded', () => {

    // 1. FIXED HEADER ON SCROLL
    const header = document.querySelector('header');

    function checkScroll() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            // Only remove scrolled if we are on index.html at the top
            // For other static pages, we keep it scrolled for visibility
            const isHomePage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
            if (isHomePage) {
                header.classList.remove('scrolled');
            } else {
                header.classList.add('scrolled');
            }
        }
    }

    // Initial check
    checkScroll();
    window.addEventListener('scroll', checkScroll);

    // 2. MOBILE BURGER MENU
    const burgerToggle = document.getElementById('burgerToggle');
    const navMenu = document.getElementById('navMenu');

    if (burgerToggle && navMenu) {
        burgerToggle.setAttribute('aria-expanded', 'false');
        burgerToggle.setAttribute('aria-controls', 'navMenu');

        function setMobileMenu(open) {
            navMenu.classList.toggle('active', open);
            burgerToggle.setAttribute('aria-expanded', String(open));

            const lines = burgerToggle.querySelectorAll('.burger-line');
            lines[0].style.transform = open ? 'rotate(45deg) translate(5px, 5px)' : 'none';
            lines[1].style.opacity = open ? '0' : '1';
            lines[2].style.transform = open ? 'rotate(-45deg) translate(6px, -6px)' : 'none';
        }

        burgerToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            setMobileMenu(!navMenu.classList.contains('active'));
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navMenu.contains(e.target) && !burgerToggle.contains(e.target)) {
                setMobileMenu(false);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                setMobileMenu(false);
            }
        });
    }

    // 3. DROPDOWNS ON MOBILE
    const dropdowns = document.querySelectorAll('.nav-item-dropdown');

    dropdowns.forEach(dropdown => {
        const link = dropdown.querySelector('.nav-link');

        if (link) {
            link.setAttribute('aria-expanded', 'false');

            link.addEventListener('click', (e) => {
                if (window.innerWidth <= 768) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Close others
                    dropdowns.forEach(other => {
                        if (other !== dropdown) {
                            other.classList.remove('active');
                            const otherLink = other.querySelector('.nav-link');
                            if (otherLink) otherLink.setAttribute('aria-expanded', 'false');
                        }
                    });

                    dropdown.classList.toggle('active');
                    link.setAttribute('aria-expanded', String(dropdown.classList.contains('active')));
                }
            });
        }
    });

    // 4. FAQ ACCORDION
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach((item, index) => {
        const trigger = item.querySelector('.faq-header');
        const body = item.querySelector('.faq-body');

        if (!trigger || !body) return;

        const bodyId = `faq-answer-${index + 1}`;
        body.id = bodyId;
        trigger.setAttribute('aria-controls', bodyId);

        trigger.addEventListener('click', () => {
            const isOpen = item.classList.contains('active');

            faqItems.forEach(other => {
                other.classList.remove('active');
                const otherTrigger = other.querySelector('.faq-header');
                if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
            });

            if (!isOpen) {
                item.classList.add('active');
                trigger.setAttribute('aria-expanded', 'true');
            }
        });
    });

    // 5. REVIEWS SLIDER/CAROUSEL (DEMO CONTENT OR VERIFIED REVIEWS)
    const carouselInner = document.querySelector('.reviews-carousel-inner');
    const slides = document.querySelectorAll('.review-slide');
    const prevBtn = document.querySelector('.carousel-btn.prev');
    const nextBtn = document.querySelector('.carousel-btn.next');
    const dotsContainer = document.querySelector('.carousel-dots');

    if (carouselInner && slides.length > 0 && dotsContainer) {
        let currentIndex = 0;
        let slideInterval;

        // Create indicator dots dynamically
        slides.forEach((_, idx) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.classList.add('carousel-dot');
            if (idx === 0) dot.classList.add('active');
            dot.setAttribute('aria-label', `Afficher l'avis ${idx + 1}`);
            dot.addEventListener('click', () => goToSlide(idx));
            dotsContainer.appendChild(dot);
        });

        const dots = document.querySelectorAll('.carousel-dot');

        function updateCarousel() {
            carouselInner.style.transform = `translateX(-${currentIndex * 100}%)`;
            dots.forEach((dot, idx) => {
                dot.classList.toggle('active', idx === currentIndex);
            });
        }

        function nextSlide() {
            currentIndex = (currentIndex + 1) % slides.length;
            updateCarousel();
        }

        function prevSlide() {
            currentIndex = (currentIndex - 1 + slides.length) % slides.length;
            updateCarousel();
        }

        function goToSlide(idx) {
            currentIndex = idx;
            updateCarousel();
            resetInterval();
        }

        function startInterval() {
            clearInterval(slideInterval);
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            slideInterval = setInterval(nextSlide, 5000);
        }

        function resetInterval() {
            clearInterval(slideInterval);
            startInterval();
        }

        function pauseInterval() {
            clearInterval(slideInterval);
        }

        if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); resetInterval(); });
        if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); resetInterval(); });
        carouselInner.addEventListener('mouseenter', pauseInterval);
        carouselInner.addEventListener('mouseleave', startInterval);
        carouselInner.addEventListener('focusin', pauseInterval);
        carouselInner.addEventListener('focusout', startInterval);

        // Touch gestures support
        let startX = 0;
        let endX = 0;

        carouselInner.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        }, { passive: true });

        carouselInner.addEventListener('touchend', (e) => {
            endX = e.changedTouches[0].clientX;
            if (startX - endX > 50) {
                nextSlide();
                resetInterval();
            } else if (endX - startX > 50) {
                prevSlide();
                resetInterval();
            }
        }, { passive: true });

        startInterval();
    }

    // 6. TOAST NOTIFICATION UTILITY
    function showToast(message, icon = 'fa-check-circle') {
        // Remove existing toast if any
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        // Create new toast element
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        const toastIcon = document.createElement('i');
        toastIcon.className = `fas ${icon}`;
        const toastText = document.createElement('span');
        toastText.textContent = message;
        toast.append(toastIcon, toastText);
        document.body.appendChild(toast);

        // Trigger reflow & show
        setTimeout(() => toast.classList.add('show'), 50);

        // Hide and remove after 4 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // 7. STATIC BOOKING CALENDAR FOR THE DEMO EXPERIENCE
    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) {
        const calendarMonth = document.getElementById('calendarMonth');
        const calendarDays = document.getElementById('calendarDays');
        const calendarSlots = document.getElementById('calendarSlots');
        const calendarPrompt = document.getElementById('calendarPrompt');
        const calendarPrev = document.getElementById('calendarPrev');
        const calendarNext = document.getElementById('calendarNext');
        const selectedDateInput = document.getElementById('bDate');
        const availableSlots = ['09:00', '10:30', '14:00', '15:30', '17:00'];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const firstDisplayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDisplayedMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1);
        let displayedMonth = new Date(firstDisplayedMonth);
        let selectedDay = null;
        let selectedSlot = '';

        function formatDate(date, options) {
            return date.toLocaleDateString('fr-FR', options);
        }

        function sameDay(firstDate, secondDate) {
            return firstDate && secondDate && firstDate.getTime() === secondDate.getTime();
        }

        function updateSelectedDate() {
            selectedDateInput.value = selectedDay && selectedSlot
                ? `${formatDate(selectedDay, { dateStyle: 'long' })} à ${selectedSlot}`
                : '';
        }

        function renderSlots() {
            calendarSlots.innerHTML = '';
            selectedSlot = '';
            updateSelectedDate();

            if (!selectedDay) {
                calendarPrompt.textContent = 'Sélectionnez un jour pour voir les horaires disponibles.';
                return;
            }

            calendarPrompt.textContent = `${formatDate(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })} - choisissez un horaire :`;
            availableSlots.forEach(slot => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'slot-button';
                button.textContent = slot;
                button.setAttribute('aria-pressed', 'false');
                button.addEventListener('click', () => {
                    calendarSlots.querySelectorAll('.slot-button').forEach(item => {
                        item.classList.remove('selected');
                        item.setAttribute('aria-pressed', 'false');
                    });
                    button.classList.add('selected');
                    button.setAttribute('aria-pressed', 'true');
                    selectedSlot = slot;
                    updateSelectedDate();
                });
                calendarSlots.appendChild(button);
            });
        }

        function renderCalendar() {
            calendarDays.innerHTML = '';
            calendarMonth.textContent = formatDate(displayedMonth, { month: 'long', year: 'numeric' });
            calendarPrev.disabled = displayedMonth.getTime() === firstDisplayedMonth.getTime();
            calendarNext.disabled = displayedMonth.getTime() === lastDisplayedMonth.getTime();

            const year = displayedMonth.getFullYear();
            const month = displayedMonth.getMonth();
            const monthStart = new Date(year, month, 1);
            const leadingEmptyCells = (monthStart.getDay() + 6) % 7;
            const monthLength = new Date(year, month + 1, 0).getDate();

            for (let index = 0; index < leadingEmptyCells; index += 1) {
                const emptyCell = document.createElement('span');
                emptyCell.className = 'calendar-empty';
                emptyCell.setAttribute('aria-hidden', 'true');
                calendarDays.appendChild(emptyCell);
            }

            for (let day = 1; day <= monthLength; day += 1) {
                const date = new Date(year, month, day);
                const isClosed = date.getDay() === 0;
                const isPast = date < today;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'calendar-day';
                button.textContent = String(day);
                button.disabled = isClosed || isPast;
                button.setAttribute('role', 'gridcell');
                button.setAttribute('aria-label', `${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}${isClosed ? ', fermé' : ''}`);

                if (sameDay(date, today)) button.classList.add('today');
                if (sameDay(date, selectedDay)) button.classList.add('selected');

                button.addEventListener('click', () => {
                    selectedDay = date;
                    renderCalendar();
                    renderSlots();
                });
                calendarDays.appendChild(button);
            }
        }

        calendarPrev.addEventListener('click', () => {
            displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
            selectedDay = null;
            renderCalendar();
            renderSlots();
        });

        calendarNext.addEventListener('click', () => {
            displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
            selectedDay = null;
            renderCalendar();
            renderSlots();
        });

        renderCalendar();

        bookingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!selectedDateInput.value) {
                showToast('Sélectionnez un jour et un horaire dans le calendrier.', 'fa-calendar-alt');
                return;
            }

            const chosenAppointment = selectedDateInput.value;
            bookingForm.reset();
            selectedDay = null;
            selectedSlot = '';
            displayedMonth = new Date(firstDisplayedMonth);
            renderCalendar();
            renderSlots();
            showToast(`Démo : demande validée pour le ${chosenAppointment}. Aucun envoi réel.`, 'fa-calendar-check');
        });
    }

    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            contactForm.reset();
            showToast("Démo : votre message est validé. Aucun envoi réel n'a été effectué.", 'fa-check-circle');
        });
    }

    // 8. LOYALTY MEMBER AREA DEMO
    const loyaltyDemo = document.querySelector('[data-loyalty-demo]');
    const loyaltyControls = document.querySelector('[data-loyalty-controls]');
    if (loyaltyDemo && loyaltyControls) {
        const startingEclats = 7;
        const startingName = 'Clara';
        let eclats = startingEclats;
        let firstName = startingName;
        const displayedName = loyaltyDemo.querySelector('[data-loyalty-firstname]');
        const count = loyaltyDemo.querySelector('[data-loyalty-count]');
        const status = loyaltyDemo.querySelector('[data-loyalty-status]');
        const nextStatus = loyaltyDemo.querySelector('[data-loyalty-next-status]');
        const progress = loyaltyDemo.querySelector('[data-loyalty-progress]');
        const progressbar = loyaltyDemo.querySelector('[data-loyalty-progressbar]');
        const message = loyaltyDemo.querySelector('[data-loyalty-message]');
        const reward = loyaltyControls.querySelector('[data-loyalty-reward]');
        const form = loyaltyControls.querySelector('[data-loyalty-form]');
        const nameInput = loyaltyControls.querySelector('[data-loyalty-name]');
        const eclatsSelect = loyaltyControls.querySelector('[data-loyalty-select]');
        const resetButton = loyaltyControls.querySelector('[data-reset-eclats]');
        const points = loyaltyDemo.querySelectorAll('.light-point');
        const tiers = document.querySelectorAll('[data-tier-name]');
        const milestones = document.querySelectorAll('[data-reward-threshold]');

        function getStatusName(total) {
            if (total >= 12) return 'Constellation';
            if (total >= 8) return 'Aura';
            if (total >= 4) return 'Halo';
            return 'Étincelle';
        }

        function eclatLabel(total) {
            return total === 1 ? 'Éclat' : 'Éclats';
        }

        function renderLoyaltyDemo() {
            const statusName = getStatusName(eclats);
            displayedName.textContent = firstName;
            count.textContent = String(eclats);
            status.textContent = statusName;
            progress.style.width = `${Math.min(eclats, 12) / 12 * 100}%`;
            progressbar.setAttribute('aria-valuenow', String(eclats));

            if (eclats >= 12) {
                nextStatus.textContent = 'Signature atteinte';
                reward.textContent = 'Privilège Signature disponible';
                message.textContent = 'Statut Constellation atteint : votre privilège Signature est disponible.';
            } else if (eclats >= 9) {
                nextStatus.textContent = `Constellation à 12`;
                reward.textContent = 'Privilège Signature à 12 Éclats';
                const remaining = 12 - eclats;
                message.textContent = `Duo Lumière débloqué. Encore ${remaining} ${eclatLabel(remaining)} avant le statut Constellation.`;
            } else if (eclats >= 8) {
                nextStatus.textContent = 'Constellation à 12';
                reward.textContent = 'Duo Lumière à 9 Éclats';
                message.textContent = 'Bienvenue dans le statut Aura. Encore 1 Éclat avant Duo Lumière.';
            } else if (eclats >= 6) {
                nextStatus.textContent = 'Aura à 8';
                reward.textContent = 'Duo Lumière à 9 Éclats';
                const remaining = 8 - eclats;
                message.textContent = `Bonus Douceur débloqué. Encore ${remaining} ${eclatLabel(remaining)} avant le statut Aura.`;
            } else if (eclats >= 3) {
                nextStatus.textContent = 'Halo à 4';
                reward.textContent = 'Bonus Douceur à 6 Éclats';
                message.textContent = 'Instant Conseil débloqué. Votre prochain statut se rapproche.';
            } else {
                nextStatus.textContent = 'Halo à 4';
                reward.textContent = 'Instant Conseil à 3 Éclats';
                message.textContent = 'Votre constellation commence à prendre forme.';
            }

            points.forEach((point, index) => {
                const earned = index < eclats;
                point.classList.toggle('earned', earned);
                if (!point.classList.contains('reward')) {
                    const icon = point.querySelector('i');
                    icon.className = earned ? 'fas fa-star' : 'far fa-star';
                }
            });

            tiers.forEach(tier => {
                tier.classList.toggle('active', tier.dataset.tierName === statusName);
            });

            milestones.forEach(milestone => {
                const threshold = Number(milestone.dataset.rewardThreshold);
                milestone.classList.toggle('unlocked', eclats >= threshold);
            });

        }

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            firstName = nameInput.value.trim() || startingName;
            eclats = Number(eclatsSelect.value);
            renderLoyaltyDemo();
            showToast(`Démo : bienvenue ${firstName}, statut ${getStatusName(eclats)} affiché.`, 'fa-star');
        });

        resetButton.addEventListener('click', () => {
            eclats = startingEclats;
            firstName = startingName;
            nameInput.value = startingName;
            eclatsSelect.value = String(startingEclats);
            renderLoyaltyDemo();
        });

        renderLoyaltyDemo();
    }

    // 9. LIGHTBOX FOR IMAGE GALLERIES
    const galleryItems = document.querySelectorAll('.gallery-item');

    if (galleryItems.length > 0) {
        // Collect all images details on the current page
        const imagesList = Array.from(galleryItems).map(item => {
            const img = item.querySelector('img');
            const caption = item.querySelector('h4');
            return {
                src: img.src,
                alt: img.alt,
                title: caption ? caption.textContent : img.alt
            };
        });

        let activeIndex = 0;
        let previouslyFocusedElement = null;

        // Dynamically create Lightbox element if it doesn't exist
        let lightbox = document.querySelector('.lightbox');
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.className = 'lightbox';
            lightbox.setAttribute('role', 'dialog');
            lightbox.setAttribute('aria-modal', 'true');
            lightbox.setAttribute('aria-label', 'Galerie agrandie');
            lightbox.setAttribute('aria-hidden', 'true');
            lightbox.innerHTML = `
                <button class="lightbox-nav prev" aria-label="Précédent"><i class="fas fa-chevron-left"></i></button>
                <div class="lightbox-content">
                    <button class="lightbox-close" aria-label="Fermer"><i class="fas fa-times"></i></button>
                    <img class="lightbox-img" src="" alt="">
                    <h3 class="lightbox-caption"></h3>
                </div>
                <button class="lightbox-nav next" aria-label="Suivant"><i class="fas fa-chevron-right"></i></button>
            `;
            document.body.appendChild(lightbox);
        }

        const lightboxImg = lightbox.querySelector('.lightbox-img');
        const lightboxCaption = lightbox.querySelector('.lightbox-caption');
        const closeBtn = lightbox.querySelector('.lightbox-close');
        const nextNav = lightbox.querySelector('.lightbox-nav.next');
        const prevNav = lightbox.querySelector('.lightbox-nav.prev');

        function openLightbox(index) {
            activeIndex = index;
            previouslyFocusedElement = document.activeElement;
            updateLightboxContent();
            lightbox.classList.add('active');
            lightbox.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden'; // Lock background scroll
            closeBtn.focus();
        }

        function closeLightbox() {
            lightbox.classList.remove('active');
            lightbox.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            if (previouslyFocusedElement) previouslyFocusedElement.focus();
        }

        function updateLightboxContent() {
            const item = imagesList[activeIndex];
            if (item) {
                lightboxImg.src = item.src;
                lightboxImg.alt = item.alt;
                lightboxCaption.textContent = item.title;
            }
        }

        function showNext() {
            activeIndex = (activeIndex + 1) % imagesList.length;
            updateLightboxContent();
        }

        function showPrev() {
            activeIndex = (activeIndex - 1 + imagesList.length) % imagesList.length;
            updateLightboxContent();
        }

        // Attach click handlers to items
        galleryItems.forEach((item, idx) => {
            const label = imagesList[idx].title;
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.setAttribute('aria-label', `Agrandir : ${label}`);
            item.addEventListener('click', () => {
                openLightbox(idx);
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openLightbox(idx);
                }
            });
        });

        // Controls
        closeBtn.addEventListener('click', closeLightbox);
        nextNav.addEventListener('click', showNext);
        prevNav.addEventListener('click', showPrev);

        // Click outside closes lightbox
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target.classList.contains('lightbox-content')) {
                closeLightbox();
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('active')) return;

            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowRight') showNext();
            if (e.key === 'ArrowLeft') showPrev();
        });
    }

});
