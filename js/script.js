// js/script.js

let isSubmitting = false;

$(document).ready(function () {
    let currentStep = 1; // Inicia no primeiro passo (bem-vindo)
    const totalSteps = 4; // Contando os passos de dados (1 a 4)
    let apprenticeCounter = 0; // Para dar IDs únicos aos aprendizes
    let pricesDataLoaded = false;
    let prefilledData = null; // Para armazenar dados pré-preenchidos
    let isResponsavelEdited = false; // Rastreia se o usuário editou o campo do responsável

    // URLs dos webhooks
    const WEBHOOK_CONSULTA_URL = 'https://criadordigital-n8n-webhook.kttqgl.easypanel.host/webhook/consulta-matricula';
    const WEBHOOK_SUBMISSAO_URL = 'https://auto-n8n-webhook.rbnawr.easypanel.host/webhook/c70b4c3c-a465-49bc-b866-1f8b6be71768lebre';

    // Inicializa as máscaras para os campos
    function initializeMasks() {
        $('.mask-cpf').mask('000.000.000-00', { reverse: true });
        $('.mask-phone').mask('(00) 0 0000-0000');
    }

    // Carrega dados e inicializa o formulário
    async function initForm() {
        pricesDataLoaded = await priceCalculator.loadPriceData();
        if (pricesDataLoaded) {
            initializeMasks();
            await checkMatriculaParam(); // Verifica e tenta pré-preencher via URL
            showStep(currentStep); // Exibe o primeiro passo
            if (!prefilledData) { // Se não houve pré-preenchimento, adiciona um aprendiz vazio
                addApprentice(false);
            }
            setupEventListeners(); // Configura todos os event listeners
            updateSummaryAndTotal(); // Calcula e exibe o resumo inicial
        } else {
            // Caso os dados não carreguem, desabilita o formulário ou exibe mensagem de erro
            $('#registrationForm').html('<p class="error-message" style="display: block; text-align: center;">Não foi possível carregar os dados do formulário. Por favor, tente novamente mais tarde.</p>');
        }
    }

    // Exibe um passo específico do formulário
    function showStep(stepNum) {
        $('.form-step').removeClass('active');
        // Mapeia os passos para os IDs reais no HTML
        let stepId;
        if (stepNum === 1) stepId = '#step-1';
        else if (stepNum === 2) stepId = '#step-2'; // Dados dos Aprendizes
        else if (stepNum === 3) stepId = '#step-3'; // Dados do Responsável
        else if (stepNum === 4) stepId = '#step-terms'; // Termos e Condições
        else if (stepNum === 5) stepId = '#step-4'; // Plano de Pagamento e Resumo
        else if (stepNum === 'success') stepId = '#step-success';

        $(stepId).addClass('active');
        currentStep = stepNum;

        // Ajusta visibilidade dos botões de navegação
        const isSuccessStep = (stepId === '#step-success');
        const isFinalDataStep = (stepId === '#step-4'); // Passo do resumo financeiro
        const isWelcomeStep = (stepId === '#step-1');

        $('.btn-prev').toggle(!isWelcomeStep && !isSuccessStep);
        $('.btn-next').toggle(!isFinalDataStep && !isSuccessStep);
        $('.btn-submit').toggle(isFinalDataStep);
        $('#goToPaymentBtn').toggle(false); // Esconde por padrão, só mostra se tiver link de pagamento

        // Rola para o topo absoluto da página
        $('html, body').animate({
            scrollTop: 0
        }, 500);
    }

    // Função para validar campos
    function validateField(inputElement, validationFn = null, errorMessage = 'Campo obrigatório.') {
        const $input = $(inputElement);
        const $formGroup = $input.closest('.form-group, .checkbox-group');
        const $errorDiv = $formGroup.find('.error-message');
        let isValid = true;

        // Limpa erros anteriores
        $input.removeClass('input-error');
        $errorDiv.hide().text('');

        if ($input.is(':checkbox')) {
            if ($input.prop('required') && !$input.is(':checked')) {
                isValid = false;
            }
        } else if ($input.prop('required') && $input.val().trim() === '') {
            isValid = false;
        } else if (validationFn && !validationFn($input.val())) {
            isValid = false;
        }

        if (!isValid) {
            $input.addClass('input-error');
            $errorDiv.text(errorMessage).show();
        }
        return isValid;
    }

    // Atualiza nome do responsável com o primeiro aprendiz se não foi editado
    function updateResponsavelFromFirstApprentice() {
        if (!isResponsavelEdited) {
            const $firstApprentice = $('#apprenticesContainer .apprentice-group:not(.template)').first();
            const firstApprenticeName = $firstApprentice.find('.nomeAprendiz').val() || '';
            $('#nomeResponsavel').val(firstApprenticeName);
        }
    }

    // Valida seleção de cursos para um aprendiz
    function validateApprenticesCourses($apprenticeGroup) {
        const $checkedCourses = $apprenticeGroup.find('.course-radio:checked');
        const $errorDiv = $apprenticeGroup.find('.courses-selection').siblings('.error-message');

        if ($checkedCourses.length === 0) {
            $errorDiv.text('Selecione um curso.').show();
            return false;
        } else {
            $errorDiv.hide().text('');
            return true;
        }
    }

    // Obtém o curso selecionado para um aprendiz
    function getSelectedCourses($apprenticeGroup) {
        const selectedCourses = [];
        const $checked = $apprenticeGroup.find('.course-radio:checked');
        if ($checked.length > 0) {
            selectedCourses.push($checked.val());
        }
        return selectedCourses;
    }

    // Valida o passo atual antes de avançar
    function validateCurrentStep() {
        let isValid = true;
        let elementsToValidate = [];

        if (currentStep === 1) {
            // Nada a validar no passo de boas-vindas
            isValid = true;
        } else if (currentStep === 2) { // Dados dos Aprendizes (step-2)
            const $apprenticeGroups = $('#apprenticesContainer .apprentice-group:not(.template)');
            if ($apprenticeGroups.length === 0) {
                alert('É necessário adicionar pelo menos um aprendiz.');
                return false;
            }

            $apprenticeGroups.each(function () {
                const $group = $(this);
                // Validar campos de cada aprendiz
                isValid = validateField($group.find('.nomeAprendiz'), null, 'Nome do aprendiz é obrigatório.') && isValid;
                isValid = validateField($group.find('.dataNascimentoAprendiz'), (val) => val.replace(/\D/g, '').length === 8, 'Data de nascimento inválida (DD/MM/AAAA).') && isValid;

                // Validação de Identidade Social
                const $socialRadios = $group.find('.identidadeSocial');
                const $socialErrorDiv = $group.find('.social-identity-error');
                if ($socialRadios.filter(':checked').length === 0) {
                    isValid = false;
                    $socialErrorDiv.text('Selecione uma opção.').show();
                } else {
                    $socialErrorDiv.hide();
                }

                // Validação de cursos usando a nova função
                isValid = validateApprenticesCourses($group) && isValid;
            });
        } else if (currentStep === 3) { // Dados do Responsável (step-3)
            elementsToValidate = [
                $('#nomeResponsavel'),
                $('#emailResponsavel'),
                $('#telefoneResponsavel'),
                $('#cpfResponsavel')
            ];

            // Validação dos campos do responsável
            isValid = validateField($('#nomeResponsavel'), null, 'Nome é obrigatório.') && isValid;
            isValid = validateField($('#emailResponsavel'), (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), 'Email inválido.') && isValid;
            isValid = validateField($('#telefoneResponsavel'), (val) => val.replace(/\D/g, '').length === 11, 'Telefone inválido.') && isValid;
            isValid = validateField($('#cpfResponsavel'), (val) => isValidCPF(val), 'CPF inválido.') && isValid;

            // Validação "Como ficou sabendo"
            const $howKnowCheckboxes = $('input[name="comoSoube"]');
            const $howKnowErrorDiv = $('.how-know-error');
            if ($howKnowCheckboxes.filter(':checked').length === 0) {
                isValid = false;
                $howKnowErrorDiv.text('Selecione pelo menos uma opção.').show();
            } else {
                $howKnowErrorDiv.hide().text('');
            }

        } else if (currentStep === 4) { // Termos e Condições (step-terms)
            isValid = validateField($('#aceiteTermos'), null, 'Você deve aceitar os termos e condições.') && isValid;

            const $photoConsentRadios = $('input[name="autorizaFoto"]');
            const $photoConsentErrorDiv = $('.photo-consent-error');
            if ($photoConsentRadios.filter(':checked').length === 0) {
                isValid = false;
                $photoConsentErrorDiv.text('Selecione uma opção para autorização de uso de imagem.').show();
            } else {
                $photoConsentErrorDiv.hide().text('');
            }
        } else if (currentStep === 5) { // Plano de Pagamento e Resumo (step-4)
            // Plano de Pagamento
            isValid = validateField($('#planoPagamento'), null, 'Selecione um plano de pagamento.') && isValid;

            // Forma de Pagamento
            isValid = validateField($('#formaPagamento'), null, 'Selecione a forma de pagamento.') && isValid;
        }
        return isValid;
    }

    // Popula a seleção de cursos com radio buttons
    function populateCourseSelection($container) {
        const $apprenticeGroup = $container.closest('.apprentice-group');
        const apprenticeNumber = $apprenticeGroup.find('.apprentice-number').text();
        const allCourses = priceCalculator.getAllCourses();

        // Obter dados atuais do aprendiz para calcular preços no rádio
        const birthDateStr = $apprenticeGroup.find('.dataNascimentoAprendiz').val();
        const isSocial = $apprenticeGroup.find('.identidadeSocial:checked').val() === 'sim';
        const paymentPlan = $('#planoPagamento').val() || 'avulso';
        const couponCode = $('#cupomCode').val();
        const hasValidCoupon = priceCalculator.isValidCoupon(couponCode);

        let age = null;
        if (birthDateStr) {
            const birthDate = new Date(birthDateStr + 'T00:00:00'); // Garante fuso horário local
            if (!isNaN(birthDate.getTime())) {
                const today = new Date();
                age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }
            }
        }

        // Limpa containers existentes
        $container.find('.courses-checkboxes').empty();

        // Separa cursos e contraturnos
        const cursos = allCourses.filter(c => c.categoria === 'curso');
        const contraturnos = allCourses.filter(c => c.categoria === 'contraturno');

        // Função para criar checkboxes
        function createCheckboxes(courseList, categoryContainer) {
            courseList.forEach(course => {
                const uniqueId = `course-${course.id}-${apprenticeNumber}`;

                // Gerar lista de todos os planos e preços disponíveis para o curso
                const pricesHtml = Object.entries(course.precos)
                    .map(([planKey, price]) => {
                        const planInfo = priceCalculator.getPaymentPlanInfo(planKey);
                        const planName = planInfo ? planInfo.nome : planKey;

                        // Verifica qual regra de preço está sendo aplicada (ignora regras se houver cupom)
                        const effectivePrice = priceCalculator.getCoursePrice(course.id, planKey, age, isSocial, hasValidCoupon);

                        return `<span class="plan-price-tag"><strong>${planName}:</strong> ${priceCalculator.formatCurrency(effectivePrice)}</span>`;
                    }).join(' <span class="price-separator">|</span> ');

                let priceNotice = '';

                // Prioridade de avisos (apenas se NÃO houver cupom)
                if (!hasValidCoupon) {
                    if (isSocial && course.preco_social && course.preco_social[paymentPlan]) {
                        priceNotice = `<div style="color: #28a745; font-weight: 600; font-size: 0.75rem; margin-bottom: 5px;">⭐ Preço Social Aplicado!</div>`;
                    } else if (course.antecipado && course.antecipado.data_limite) {
                        const parts = course.antecipado.data_limite.split('/');
                        const limitDate = new Date(parts[2], parts[1] - 1, parts[0], 23, 59, 59);
                        if (new Date() <= limitDate) {
                            priceNotice = `<div style="color: #DE0D3C; font-weight: 600; font-size: 0.75rem; margin-bottom: 5px;">🔥 Inscrição Antecipada até ${course.antecipado.data_limite}!</div>`;
                        }
                    } else if (age !== null && course.faixas_etarias) {
                        const faixa = course.faixas_etarias.find(f => age >= f.min && age <= f.max);
                        if (faixa) {
                            priceNotice = `<div style="color: #007bff; font-weight: 600; font-size: 0.75rem; margin-bottom: 5px;">🎂 Preço p/ faixa etária (${age} anos)</div>`;
                        }
                    }
                }

                const detailsHtml = `
                    <div class="course-details-info" style="font-size: 0.8rem; color: #666; margin-top: 5px;">
                        ${priceNotice}
                        ${course.inicio ? `<strong>Início:</strong> ${course.inicio}<br>` : ''}
                        ${course.dia_horario ? `<strong>Horário:</strong> ${course.dia_horario}<br>` : ''}
                        ${course.duracao_aula ? `<strong>Duração:</strong> ${course.duracao_aula}<br>` : ''}
                        ${course.qtd_aulas ? `<strong>Aulas:</strong> ${course.qtd_aulas}<br>` : ''}
                        ${course.educador ? `<strong>Educador(a):</strong> ${course.educador}` : ''}
                    </div>
                `;

                const isSelected = $container.find(`input[value="${course.id}"]`).is(':checked');

                const checkboxHtml = `
                    <div class="checkbox-group">
                        <input type="radio" 
                               name="course-apprentice-${apprenticeNumber}"
                               class="course-radio" 
                               value="${course.id}" 
                               id="${uniqueId}"
                               ${isSelected ? 'checked' : ''}>
                        <label for="${uniqueId}">
                            <strong>${course.nome}</strong>
                            ${detailsHtml}
                            <div class="course-plans-prices">${pricesHtml}</div>
                        </label>
                    </div>
                `;
                categoryContainer.append(checkboxHtml);
            });
        }

        // Cria checkboxes para cada categoria
        createCheckboxes(cursos, $container.find('[data-category="curso"]'));
        createCheckboxes(contraturnos, $container.find('[data-category="contraturno"]'));
    }

    // Adiciona um novo grupo de aprendiz
    function addApprentice(animate = true, apprenticeData = null) {
        apprenticeCounter++;
        const $newApprentice = $('.apprentice-group.template').clone().removeClass('template').removeAttr('style');

        // Atualiza IDs e 'for' dos labels para serem únicos
        $newApprentice.find('label, input, select, textarea').each(function () {
            const $this = $(this);
            const oldId = $this.attr('id');
            if (oldId) {
                const newId = oldId.replace('-TEMPLATE', '-' + apprenticeCounter);
                $this.attr('id', newId);
                // Atualiza 'for' do label (se existir)
                $(`label[for="${oldId}"]`).attr('for', newId);
            }
        });

        // Atualiza o número do aprendiz no título
        $newApprentice.find('.apprentice-number').text(apprenticeCounter);

        // Popula a seleção de cursos com checkboxes
        const $courseContainer = $newApprentice.find('.courses-selection');
        populateCourseSelection($courseContainer);

        // Mostra o botão de remover se houver mais de um aprendiz
        if ($('#apprenticesContainer .apprentice-group:not(.template)').length > 0) {
            $newApprentice.find('.btn-remove-apprentice').show();
        }

        $('#apprenticesContainer').append($newApprentice);

        // Preenche dados se houver prefilledData para este aprendiz
        if (apprenticeData) {
            $newApprentice.find('.nomeAprendiz').val(apprenticeData.nome);
            $newApprentice.find('.dataNascimentoAprendiz').val(apprenticeData.dataNascimento);

            // Seleciona os cursos. Os dados do webhook vêm com nomes, precisamos dos IDs
            if (apprenticeData.cursos && Array.isArray(apprenticeData.cursos)) {
                const allCourses = priceCalculator.getAllCourses();
                apprenticeData.cursos.forEach(courseName => {
                    const courseObj = allCourses.find(c => c.nome === courseName);
                    if (courseObj) {
                        $newApprentice.find(`input[value="${courseObj.id}"]`).prop('checked', true);
                    }
                });
            }
        }

        initializeMasks(); // Aplica máscaras aos novos campos

        if (animate) {
            $newApprentice.hide().fadeIn(300);
        }

        // Atualiza a visibilidade dos botões de remover
        updateRemoveButtons();
        updateSummaryAndTotal(); // Recalcula após adicionar
        updateResponsavelFromFirstApprentice(); // Sincroniza o nome do responsável
    }

    // Remove um grupo de aprendiz
    function removeApprentice(button) {
        if ($('#apprenticesContainer .apprentice-group:not(.template)').length > 1) {
            $(button).closest('.apprentice-group').fadeOut(300, function () {
                $(this).remove();
                // Reordena os números dos aprendizes visíveis
                $('#apprenticesContainer .apprentice-group:not(.template)').each(function (index) {
                    $(this).find('.apprentice-number').text(index + 1);
                });
                updateRemoveButtons();
                updateSummaryAndTotal(); // Recalcula após remover
                updateResponsavelFromFirstApprentice(); // Sincroniza o nome do responsável
            });
        } else {
            alert('Você deve ter pelo menos um aprendiz.');
        }
    }

    // Atualiza a visibilidade dos botões de remover
    function updateRemoveButtons() {
        const $apprenticeGroups = $('#apprenticesContainer .apprentice-group:not(.template)');
        if ($apprenticeGroups.length <= 1) {
            $apprenticeGroups.find('.btn-remove-apprentice').hide();
        } else {
            $apprenticeGroups.find('.btn-remove-apprentice').show();
        }
    }

    // Coleta todos os dados do formulário
    function collectFormData() {
        const formData = {
            matricula: $('#matricula').val(),
            responsavel: {
                nome: $('#nomeResponsavel').val(),
                cpf: $('#cpfResponsavel').val().replace(/\D/g, ''),
                email: $('#emailResponsavel').val(),
                telefone: $('#telefoneResponsavel').val().replace(/\D/g, '')
            },
            comoSoube: [],
            aprendizes: [],
            planoPagamento: $('#planoPagamento').val(),
            formaPagamento: $('#formaPagamento').val(),
            aceiteTermos: $('#aceiteTermos').is(':checked'),
            autorizaFoto: $('input[name="autorizaFoto"]:checked').val(),
            cupomCode: $('#cupomCode').val().toUpperCase()
        };

        // Coleta "Como soube"
        $('input[name="comoSoube"]:checked').each(function () {
            formData.comoSoube.push($(this).val());
        });

        $('#apprenticesContainer .apprentice-group:not(.template)').each(function () {
            const $group = $(this);
            const selectedCourseIds = getSelectedCourses($group);
            const enrichedCursos = selectedCourseIds.map(id => {
                const c = priceCalculator.getCourseById(id);
                return {
                    id: id,
                    nome: c.nome,
                    educador: c.educador || '',
                    telefone_educador: c.telefone_educador || '',
                    dia_horario: c.dia_horario || '',
                    qtd_aulas: c.qtd_aulas || '',
                    min_alunos: c.min_alunos || '',
                    inicio: c.inicio || '',
                    fim: c.fim || '',
                    dueDate: c.dueDate || ''
                };
            });

            const aprendiz = {
                nome: $group.find('.nomeAprendiz').val(),
                dataNascimento: $group.find('.dataNascimentoAprendiz').val(),
                identidadeSocial: $group.find('.identidadeSocial:checked').val(),
                cursos: enrichedCursos
            };
            formData.aprendizes.push(aprendiz);
        });

        // Adiciona os detalhes de preço calculados
        const priceDetails = updateSummaryAndTotal();
        formData.resumoFinanceiro = priceDetails;
        formData.valor_calculado_total = priceDetails.total;

        // Serializa os detalhes da matrícula para o campo oculto
        // Converte os IDs dos cursos para os nomes dos cursos para o backend
        const detalhesAprendizesParaBackend = formData.aprendizes.map(ap => {
            return {
                ...ap,
                cursos: ap.cursos.map(c => c.nome) // Mantém compatibilidade se o backend esperar apenas nomes aqui
            };
        });

        const planInfo = priceCalculator.getPaymentPlanInfo(formData.planoPagamento);
        const parcelas = planInfo ? planInfo.parcelas : 1;

        formData.detalhes_matricula = JSON.stringify({
            responsavel: formData.responsavel.nome,
            aprendizes: formData.aprendizes, // Envia o objeto rico agora
            planoPagamento: formData.planoPagamento,
            cupomAplicado: formData.cupomCode,
            valorFinal: formData.valor_calculado_total,
            quantidadeParcelas: parcelas,
            dataPrimeiroVencimento: 'Imediato' // Ou usar a data de início do curso se preferir
        });

        return formData;
    }

    // Atualiza a seção de resumo e o total
    function updateSummaryAndTotal() {
        if (!pricesDataLoaded) return { total: 0 };

        const selectedCoursesData = []; // Array de {id, age, isSocial}
        const apprenticesSummary = [];
        let apprenticesCount = 0;

        // OBTENHA O PLANO DE PAGAMENTO AQUI, ANTES DE ITERAR PELOS APRENDIZES
        const paymentPlan = $('#planoPagamento').val() || 'avulso'; // 'avulso' como padrão

        // Atualiza a política de cancelamento com base no plano selecionado
        updateCancellationPolicy(paymentPlan);

        const couponCode = $('#cupomCode').val();
        const paymentMethod = $('#formaPagamento').val();
        const hasValidCoupon = priceCalculator.isValidCoupon(couponCode);

        $('#apprenticesContainer .apprentice-group:not(.template)').each(function () {
            const $group = $(this);
            const apprenticeName = $group.find('.nomeAprendiz').val() || `Aprendiz ${$group.find('.apprentice-number').text()}`;
            const birthDateStr = $group.find('.dataNascimentoAprendiz').val();
            const isSocial = $group.find('.identidadeSocial:checked').val() === 'sim';
            const selectedCourseIds = getSelectedCourses($group);

            let age = null;
            if (birthDateStr) {
                const birthDate = new Date(birthDateStr + 'T00:00:00');
                if (!isNaN(birthDate.getTime())) {
                    const today = new Date();
                    age = today.getFullYear() - birthDate.getFullYear();
                    const m = today.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                        age--;
                    }
                }
            }

            apprenticesCount++;

            const coursesDetails = [];
            selectedCourseIds.forEach(courseId => {
                selectedCoursesData.push({
                    id: courseId,
                    age: age,
                    isSocial: isSocial
                });
                const course = priceCalculator.getCourseById(courseId);
                const courseName = course.nome;
                const coursePrice = priceCalculator.getCoursePrice(courseId, paymentPlan, age, isSocial, hasValidCoupon);

                if (coursePrice === 0) {
                    coursesDetails.push(`
                        <span class="course-summary-error">
                            <strong>${courseName}:</strong> 
                            <span class="warning-text">Incompatível com o plano ${priceCalculator.getPaymentPlanInfo(paymentPlan)?.nome || paymentPlan}</span>
                            <div class="incompatibility-msg">Este curso não pode ser adquirido com o plano de pagamento selecionado.</div>
                        </span>
                    `);
                } else {
                    let detailedInfo = `
                        <div class="summary-course-item" style="margin-bottom: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                <span style="font-weight: 700; color: #3A2316;">${courseName}</span>
                                <span style="font-weight: 700; color: #DE0D3C; font-size: 1.1rem;">${priceCalculator.formatCurrency(coursePrice)}</span>
                            </div>
                            ${course.inicio || course.dia_horario || course.educador ? `
                                <div class="summary-course-meta" style="font-size: 0.8rem; color: #6c757d; margin-top: 2px; line-height: 1.2;">
                                    ${course.inicio ? `Início: ${course.inicio}` : ''} 
                                    ${course.dia_horario ? ` | Horário: ${course.dia_horario}` : ''} 
                                    ${course.educador ? ` | Educador: ${course.educador}` : ''}
                                </div>
                            ` : ''}
                        </div>
                    `;
                    coursesDetails.push(detailedInfo);
                }
            });

            apprenticesSummary.push({
                name: apprenticeName,
                courses: coursesDetails
            });
        });



        const totals = priceCalculator.calculateTotal(
            selectedCoursesData,
            paymentPlan,
            couponCode,
            paymentMethod,
            apprenticesCount
        );

        // Atualiza a lista de aprendizes no resumo
        const $summaryList = $('#summaryApprenticesList');
        $summaryList.empty();
        if (apprenticesSummary.length > 0) {
            apprenticesSummary.forEach(app => {
                if (app.courses.length > 0) {
                    $summaryList.append(`<li><strong style="font-size: 1.1rem; color: #495057; border-bottom: 1px dashed #eee; padding-bottom: 5px; margin-bottom: 10px;">${app.name}:</strong>${app.courses.join('')}</li>`);
                } else {
                    $summaryList.append(`<li><strong>${app.name}:</strong> Nenhum curso selecionado</li>`);
                }
            });
        } else {
            $summaryList.append(`<li>Nenhum aprendiz adicionado</li>`);
        }

        // Atualiza os valores financeiros usando formatCurrency
        $('#summarySubtotal').text(priceCalculator.formatCurrency(totals.subtotal));
        $('#summaryDiscount').text(priceCalculator.formatCurrency(totals.discountAmount));
        $('#summaryCoupon').text(priceCalculator.formatCurrency(totals.couponAmount));
        $('#summaryCardFee').text(priceCalculator.formatCurrency(totals.cardFee));
        $('#summaryTotal').text(priceCalculator.formatCurrency(totals.total));

        // Atualiza os campos ocultos
        $('#valor_calculado_total').val(totals.total.toFixed(2));

        // Atualiza a nota de quórum mínimo baseada no primeiro curso selecionado
        if (selectedCoursesData.length > 0) {
            const firstCourseId = selectedCoursesData[0].id;
            const course = priceCalculator.getCourseById(firstCourseId);
            const minAlunos = course.min_alunos || 3;
            $('#min-students-note').text(`* Mínimo de ${minAlunos} alunos para formação de turma.`);
        } else {
            $('#min-students-note').text(`* Mínimo de 3 alunos para formação de turma.`);
        }

        return totals;
    }

    // Atualiza o texto da política de cancelamento
    function updateCancellationPolicy(planKey) {
        const $policyContainer = $('#cancellation-policy');
        let policyText = '';

        // Tenta obter o nome do plano via helper ou usa o próprio key capitalizado
        const planInfo = priceCalculator.getPaymentPlanInfo(planKey);
        // Fallback simples se não achar o plano (ex: experimental/avulso que as vezes não tem 'nome' no json da mesma forma, ou se for null)
        let planName = planInfo ? planInfo.nome : planKey.charAt(0).toUpperCase() + planKey.slice(1);

        const titleHtml = `<h5 style="margin-top: 0; margin-bottom: 8px; font-size: 1rem; color: #DE0D3C;">Política de Cancelamento do Plano ${planName}</h5>`;

        if (planKey === 'mensal') {
            policyText = `
                ${titleHtml}
                <p style="margin: 0;">Cancelamento a qualquer momento, com aviso prévio de 30 dias.</p>
            `;
        } else if (planKey === 'semestral') {
            policyText = `
                ${titleHtml}
                <ul style="padding-left: 20px; margin: 0;">
                    <li>Compromisso mínimo de 6 meses.</li>
                    <li>Em caso de cancelamento antecipado, será cobrada multa equivalente a até 2 mensalidades, limitada ao valor das parcelas restantes.</li>
                </ul>
            `;
        } else if (planKey === 'anual') {
            policyText = `
                ${titleHtml}
                <ul style="padding-left: 20px; margin: 0;">
                    <li>Compromisso mínimo de 12 meses.</li>
                    <li>Em caso de cancelamento antecipado, será cobrada multa equivalente a até 3 mensalidades, limitada ao valor das parcelas restantes.</li>
                </ul>
            `;
        }

        if (policyText) {
            $policyContainer.html(policyText).show();
        } else {
            $policyContainer.hide().empty();
        }
    }

    // Verifica o parâmetro 'matricula' na URL e tenta pré-preencher
    async function checkMatriculaParam() {
        const urlParams = new URLSearchParams(window.location.search);
        const matricula = urlParams.get('matricula');
        if (matricula) {
            $('#matricula').val(matricula);
            console.log('Matrícula pré-preenchida via URL:', matricula);

            try {
                // Remove qualquer aprendiz padrão adicionado antes do pré-preenchimento
                $('#apprenticesContainer .apprentice-group:not(.template)').remove();
                apprenticeCounter = 0; // Reseta o contador para os aprendizes pré-preenchidos

                const response = await fetch(`${WEBHOOK_CONSULTA_URL}?matricula=${matricula}`);
                if (!response.ok) {
                    throw new Error(`Erro ao consultar dados de matrícula: ${response.statusText}`);
                }
                const data = await response.json();

                if (data.success && data.data) {
                    prefilledData = data.data;
                    console.log('Dados pré-preenchidos recebidos:', prefilledData);
                    fillFormWithPrefilledData(prefilledData);
                } else {
                    console.warn('Resposta do webhook de consulta de matrícula não indica sucesso ou não contém dados.');
                    // Adiciona um aprendiz vazio se a consulta falhar
                    addApprentice(false);
                }
            } catch (error) {
                console.error('Erro ao pré-preencher formulário via webhook:', error);
                alert('Não foi possível carregar dados de rematrícula. Por favor, preencha manualmente.');
                // Adiciona um aprendiz vazio se a consulta falhar
                addApprentice(false);
            }
        }
    }

    // Preenche o formulário com os dados recebidos do webhook
    function fillFormWithPrefilledData(data) {
        // Dados do Responsável
        if (data.responsavel) {
            $('#nomeResponsavel').val(data.responsavel.nome);
            $('#cpfResponsavel').val(data.responsavel.cpf).trigger('input'); // Trigger para aplicar máscara
            $('#emailResponsavel').val(data.responsavel.email);
            $('#telefoneResponsavel').val(data.responsavel.telefone).trigger('input'); // Trigger para aplicar máscara
            $('#enderecoResponsavel').val(data.responsavel.endereco || '');
            $('#segundoResponsavelNome').val(data.responsavel.segundoResponsavelNome || '');
            $('#segundoResponsavelTelefone').val(data.responsavel.segundoResponsavelTelefone || '').trigger('input');
        }

        // Campo de emergência (agora no responsável)
        if (data.emergenciaQuemChamar) {
            $('#emergenciaQuemChamar').val(data.emergenciaQuemChamar);
        }

        // Como ficou sabendo
        if (data.comoSoube && Array.isArray(data.comoSoube)) {
            $('input[name="comoSoube"]').prop('checked', false); // Desmarcar todos primeiro
            data.comoSoube.forEach(source => {
                $(`input[name="comoSoube"][value="${source}"]`).prop('checked', true);
            });
        }

        // Aprendizes
        if (data.aprendizes && Array.isArray(data.aprendizes)) {
            $('#apprenticesContainer').empty(); // Limpa aprendizes existentes (se houver)
            apprenticeCounter = 0; // Reseta o contador
            data.aprendizes.forEach(apprentice => {
                addApprentice(true, apprentice); // Adiciona e preenche cada aprendiz
            });
        }

        // Plano de Pagamento
        if (data.planoPagamento) {
            updatePaymentPlanOptions();
            $('#planoPagamento').val(data.planoPagamento);
        }

        // Forma de Pagamento
        if (data.formaPagamento) {
            $('#formaPagamento').val(data.formaPagamento).trigger('change');
        }

        // Cupom Code
        if (data.couponCode) {
            $('#cupomCode').val(data.couponCode).trigger('input');
        }

        // Autorização de foto (agora está nos termos)
        if (data.autorizaFoto) {
            $(`input[name="autorizaFoto"][value="${data.autorizaFoto}"]`).prop('checked', true);
        }

        updateSummaryAndTotal(); // Atualiza o resumo com os dados pré-preenchidos
    }

    // Função para processar a submissão do formulário
    async function processFormSubmission() {
        console.log('Iniciando processamento da submissão...');

        // ✅ PROTEÇÃO CONTRA MÚLTIPLOS ENVIOS
        if (isSubmitting) {
            console.log('⚠️ Envio já em andamento, ignorando clique duplicado');
            return;
        }

        // Valida o último passo antes de submeter
        if (!validateCurrentStep()) {
            alert('Por favor, preencha todos os campos obrigatórios corretamente antes de prosseguir.');
            return;
        }

        // ✅ MARCA COMO "ENVIANDO"
        isSubmitting = true;

        // ✅ DESABILITA O BOTÃO IMEDIATAMENTE
        const $submitBtn = $('.btn-submit');
        const originalBtnText = $submitBtn.text();
        $submitBtn.prop('disabled', true).text('Enviando...');

        const formData = collectFormData();
        console.log('Dados do Formulário para Submissão:', formData);

        // Referências aos elementos da tela de status
        const $statusBox = $('#registrationStatusBox');
        const $statusHeading = $('#statusHeading');
        const $statusMessage = $('#statusMessage');
        const $goToPaymentBtn = $('#goToPaymentBtn');

        // 1. Mostrar a tela de sucesso e definir estado de "processando"
        showStep('success');

        $statusBox.removeClass('status-success status-error').addClass('status-processing');
        $statusHeading.html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Aguarde...');
        $statusMessage.text('Estamos processando sua inscrição...');
        $goToPaymentBtn.hide();

        // Enviar dados para o backend via AJAX
        try {
            console.log('Enviando dados para:', WEBHOOK_SUBMISSAO_URL);

            // ✅ ADICIONA TIMEOUT DE 60 SEGUNDOS
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos

            const response = await fetch(WEBHOOK_SUBMISSAO_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData),
                signal: controller.signal // ✅ Adiciona controle de timeout
            });

            clearTimeout(timeoutId); // ✅ Limpa o timeout se a resposta chegar

            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);

            if (!response.ok) {
                throw new Error(`Erro ao enviar inscrição: ${response.status} - ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Inscrição enviada com sucesso (resposta do webhook):', result);

            // 2. Processamento bem-sucedido do webhook
            $statusBox.removeClass('status-processing').addClass('status-success');
            $statusHeading.html('✅ Sucesso!');

            if (formData.formaPagamento === 'Bolsista Integral') {
                $statusMessage.text('Sua inscrição como bolsista foi registrada com sucesso. Em breve entraremos em contato para os próximos passos.');
                $goToPaymentBtn.hide();
            } else if (result.link) {
                $statusMessage.text('Sua inscrição foi finalizada com sucesso! Clique abaixo para prosseguir com o pagamento.');
                $goToPaymentBtn.data('payment-link', result.link).show();
            } else {
                $statusMessage.text('Inscrição finalizada com sucesso, mas não foi possível obter o link de pagamento. Por favor, entre em contato com a administração do Quintal das Artes.');
                $goToPaymentBtn.hide();
            }

            // ✅ ESCONDE O BOTÃO DE SUBMIT APÓS SUCESSO (já que mudamos para tela de sucesso)
            $submitBtn.hide();

        } catch (error) {
            // 3. Captura de erro (rede, servidor, timeout, ou response.ok false)
            console.error('Erro ao enviar inscrição:', error);

            $statusBox.removeClass('status-processing status-success').addClass('status-error');
            $statusHeading.html('❌ Erro!');

            // ✅ MENSAGEM ESPECÍFICA PARA TIMEOUT
            if (error.name === 'AbortError') {
                $statusMessage.text('A requisição demorou muito para responder. Por favor, verifique sua conexão e tente novamente.');
            } else {
                $statusMessage.text('Ocorreu um erro ao finalizar a inscrição. Por favor, tente novamente ou entre em contato.');
            }

            $goToPaymentBtn.hide();

            // ✅ REABILITA O BOTÃO EM CASO DE ERRO
            $submitBtn.prop('disabled', false).text(originalBtnText);
            isSubmitting = false;

            // ✅ VOLTA PARA O PASSO ANTERIOR (passo do resumo) PARA PERMITIR NOVA TENTATIVA
            showStep(5); // Volta para o passo de resumo financeiro

        } finally {
            // ✅ GARANTE QUE A FLAG SEJA RESETADA APENAS EM CASO DE SUCESSO
            // (em caso de erro, já foi resetada no catch)
            if ($statusBox.hasClass('status-success')) {
                // Não reseta isSubmitting em caso de sucesso para evitar reenvios
                console.log('✅ Submissão concluída com sucesso');
            }
        }
    }

    // Configura todos os event listeners
    function setupEventListeners() {
        console.log('Configurando event listeners...');

        // Variável para rastrear se o usuário editou manualmente o campo do responsável
        let isResponsavelEdited = false;

        $('#nomeResponsavel').on('input', function () {
            isResponsavelEdited = $(this).val().trim() !== '';
        });

        // Atualiza nome do responsável com o primeiro aprendiz se não foi editado
        function updateResponsavelFromFirstApprentice() {
            if (!isResponsavelEdited) {
                const $firstApprentice = $('#apprenticesContainer .apprentice-group:not(.template)').first();
                const firstApprenticeName = $firstApprentice.find('.nomeAprendiz').val() || '';
                $('#nomeResponsavel').val(firstApprenticeName);
            }
        }

        $('#apprenticesContainer').on('input', '.nomeAprendiz', function () {
            updateResponsavelFromFirstApprentice();
        });

        // Navegação entre passos
        $('.btn-next').on('click', function () {
            console.log('Botão próximo clicado, passo atual:', currentStep);
            if (validateCurrentStep()) {
                if (currentStep < totalSteps + 1) { // totalSteps + 1 para incluir o passo de termos
                    showStep(currentStep + 1);
                }
            } else {
                alert('Por favor, preencha todos os campos obrigatórios corretamente antes de prosseguir.');
            }
        });

        $('.btn-prev').on('click', function () {
            console.log('Botão anterior clicado, passo atual:', currentStep);
            if (currentStep > 1) {
                showStep(currentStep - 1);
            }
        });

        // Event listener específico para o botão de submit
        $('.btn-submit').on('click', function (event) {
            console.log('Botão Finalizar Inscrição clicado!');
            event.preventDefault();
            event.stopPropagation();
            processFormSubmission();
        });

        // Previne o envio padrão do formulário
        $('#registrationForm').on('submit', function (event) {
            console.log('Form submit event interceptado');
            event.preventDefault();
            event.stopPropagation();
            return false;
        });

        // Adicionar/Remover Aprendiz
        $('.btn-add-apprentice').on('click', function () {
            addApprentice();
        });

        $('#apprenticesContainer').on('click', '.btn-remove-apprentice', function () {
            removeApprentice(this);
            // Após remover, verifica se o novo "primeiro" aprendiz deve atualizar o responsável
            updateResponsavelFromFirstApprentice();
        });

        // Monitora mudança na identidade social ou data de nascimento para atualizar a lista de cursos (preços/avisos)
        $('#apprenticesContainer').on('change', '.identidadeSocial, .dataNascimentoAprendiz', function () {
            const $container = $(this).closest('.apprentice-group').find('.courses-selection');
            populateCourseSelection($container);
        });

        // Disparar cálculo ao mudar seleção de curso, plano, cupom ou identidade social
        $('#registrationForm').on('change', '.course-radio, #planoPagamento, .identidadeSocial, .dataNascimentoAprendiz', function () {
            if ($(this).hasClass('course-radio')) {
                updatePaymentPlanOptions();
            }
            updateSummaryAndTotal();
        });

        // Função para atualizar as opções do select de plano de pagamento
        function updatePaymentPlanOptions() {
            const $planoSelect = $('#planoPagamento');
            const currentSelectedPlan = $planoSelect.val();
            const allSelectedCourseIds = [];

            $('#apprenticesContainer .apprentice-group:not(.template)').each(function () {
                const selectedIds = getSelectedCourses($(this));
                allSelectedCourseIds.push(...selectedIds);
            });

            // Se não houver cursos, mantém as opções padrão
            if (allSelectedCourseIds.length === 0) return;

            // Coleta todos os planos possíveis dos cursos selecionados
            const availablePlans = new Set();
            const allCourses = priceCalculator.getAllCourses();

            allSelectedCourseIds.forEach(id => {
                const course = allCourses.find(c => c.id === id);
                if (course && course.precos) {
                    Object.keys(course.precos).forEach(planKey => availablePlans.add(planKey));
                }
            });

            // Limpa e repopula o select
            $planoSelect.empty();
            $planoSelect.append('<option value="">Selecione um plano de pagamento</option>');

            const allPlans = priceCalculator.getPricesData().planos;

            // Ordenar planos: avulso primeiro, depois os outros
            const sortedPlans = Object.keys(allPlans).sort((a, b) => {
                if (a === 'avulso') return -1;
                if (b === 'avulso') return 1;
                return 0;
            });

            sortedPlans.forEach(planKey => {
                if (availablePlans.has(planKey)) {
                    const plan = allPlans[planKey];
                    const selected = planKey === currentSelectedPlan ? 'selected' : '';
                    $planoSelect.append(`<option value="${planKey}">${plan.nome}</option>`);
                }
            });

            // Se houver apenas uma opção (além do placeholder), seleciona automaticamente e esconde
            const availableOptions = $planoSelect.find('option[value!=""]');
            if (availableOptions.length === 1) {
                const singleValue = availableOptions.val();
                $planoSelect.val(singleValue).trigger('change');
                $planoSelect.closest('.form-group').hide();
            } else if (availableOptions.length > 1) {
                $planoSelect.closest('.form-group').show();
                // Se o plano que estava selecionado antes ainda existe, mantém ele
                if (currentSelectedPlan && $planoSelect.find(`option[value="${currentSelectedPlan}"]`).length > 0) {
                    $planoSelect.val(currentSelectedPlan);
                }
            } else {
                $planoSelect.closest('.form-group').hide();
            }
        }

        // Monitora mudança na forma de pagamento
        $('#formaPagamento').on('change', function () {
            updateSummaryAndTotal();
        });

        $('#cupomCode').on('input', function () {
            const cupomFeedback = $('.cupom-feedback');
            const couponValue = $(this).val().toUpperCase();
            if (couponValue === '') {
                cupomFeedback.text('').removeClass('error success');
            } else if (priceCalculator.getCouponsData()[couponValue]) {
                cupomFeedback.text('Cupom válido!').addClass('success').removeClass('error');
            } else {
                cupomFeedback.text('Cupom inválido.').addClass('error').removeClass('success');
            }
            updateSummaryAndTotal();
        });

        // Live validation para CPF e Email em blur
        $('#cpfResponsavel').on('blur', function () {
            validateField(this, (val) => isValidCPF(val), 'CPF inválido.');
        });

        $('#emailResponsavel').on('blur', function () {
            validateField(this, (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), 'Email inválido.');
        });

        // Validação genérica para campos required em blur
        $('#registrationForm').on('blur', 'input[required], select[required], textarea[required]', function () {
            validateField(this);
        });

        // Validação "Como ficou sabendo" em change
        $('input[name="comoSoube"]').on('change', function () {
            const $howKnowCheckboxes = $('input[name="comoSoube"]');
            const $howKnowErrorDiv = $('.how-know-error');
            if ($howKnowCheckboxes.filter(':checked').length === 0) {
                $howKnowErrorDiv.text('Selecione pelo menos uma opção.').show();
            } else {
                $howKnowErrorDiv.hide().text('');
            }
        });

        // Validação de radio buttons de autorização de foto
        $('input[name="autorizaFoto"]').on('change', function () {
            const $photoConsentRadios = $('input[name="autorizaFoto"]');
            const $photoConsentErrorDiv = $('.photo-consent-error');
            if ($photoConsentRadios.filter(':checked').length === 0) {
                $photoConsentErrorDiv.text('Selecione uma opção para autorização de uso de imagem.').show();
            } else {
                $photoConsentErrorDiv.hide().text('');
            }
        });

        // Botão de redirecionamento para pagamento
        $('#goToPaymentBtn').on('click', function () {
            const paymentLink = $(this).data('payment-link');
            if (paymentLink) {
                window.open(paymentLink, '_blank');
            }
        });

        console.log('Event listeners configurados com sucesso!');
    }

    // Inicia o formulário quando o DOM estiver pronto
    initForm();
});
