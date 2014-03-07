$(function() {

    // Config settings as defined by PageListPermissions.module
    var moduleConfig = config.PageListPermissions;

    // $view objects are cached to avoid new request being sent for each access
    // management icon "mouse enter" or "click" event (note: 15 minute timeout)
    var cacheTimeout = 15 * 60 * 1000;
    var cache = {};

    // clones is used to store page list links so that when hover/click events
    // are triggered for access management icon we can remove click event from
    // matching page list link, store original link in clones and later return
    // it without too much hassle (returning removed events is complicated..)
    var clones = {};

    // var placeholders and general use jQuery objects (close button)
    var $a, $view, $preview, $request, viewData, marginLeft, previewLock;
    var $close = $('<a href="#" class="access-management-close">x</a>');

    // overlay element "fades out" background and closes $view when clicked
    var $overlay = $('<div id="access-management-overlay"></div>');
    if (!$.support.opacity) $overlay.addClass('transparent');
    $overlay.on('click', function() { closeView() }).prependTo('body');

    var setData = function() {
        // fill in data (hash, later converted to JSON string) with selected
        // groups and permissions those groups have (view/edit)
        var data = {};
        $('#access-management form tr:has(td)').each(function() {
            var group = $(this).find('td:first').data('group-id');
            if (group) {
                var perms = {
                    view: true,
                    edit: $(this).find('input[data-name=edit]').prop('checked')
                };
                data[group] = perms;
            }
        });
        data = JSON.stringify(data);
        $('#access-management form textarea[name=data]').val(data);
        // check if data has changed since $view object was created; if it was,
        // enable form submit button and make it possible to submit the form
        if ($view && viewData && data != viewData) {
            $view.find('button').removeAttr('disabled').removeClass('ui-state-disabled');
        } else if ($view && viewData) {
            $view.find('button').attr('disabled', 'disabled').addClass('ui-state-disabled');
        }
        // return data, so that we can store it when needed (such as when new
        // $view object is initiated / created)
        return data;
    }

    var setCache = function(page, data) {
        // store data from AJAX GET request (and page parents) to cache hash
        var date = new Date();
        cache[page] = { data: data, parents: [], time: date.getTime() };
        $('.PageListID' + page).parents('.PageList').each(function() {
            var $parent = $(this).prev('.PageListItem');
            if ($parent.length && $parent.find('i.access-management').length) {
                cache[page].parents.push($parent.find('i.access-management').data('page'));
            }
        });
    }

    var clearCache = function(page) {
        // clear cache for given page and it's children
        delete cache[page];
        for (key in cache) {
            if ($.inArray(page, cache[key].parents) > -1) {
                delete cache[key];
            }
        }
    }

    var closeView = function() {
        // check if there are unsaved changes
        var $button = $view.find('button');
        if (!$button.attr('disabled')) {
            // changes have been made, confirm before closing view
            if (!confirm($button.data('confirm'))) return false;
        }
        // handle cached elements and data
        var viewPage = $view.data('page');
        if (clones[viewPage]) {
            clones[viewPage].find('i.access-management:first').removeClass('open');
            $('.PageListID' + viewPage + ' > a:first').replaceWith(clones[viewPage]);
            clones[viewPage] = null;
        }
        // hide (and unset) view object (grab $parent first)
        var $parent = $view.parents('.PageListItem:first');
        $view.fadeOut('fast', function() {
            $(this).remove();
            $view = null;
        });
        viewData = null;
        // hide overlay and display visual effect if save occurred
        $overlay.fadeOut('fast', function() {
            $('body').removeClass('access-management-overlay');
            if ($parent.hasClass('saved')) {
                $parent.fadeOut('fast', function() {
                    $(this).fadeIn('fast', function() {
                        $(this).removeClass('saved');
                    });
                });
            }
        });
    }

    $('#PageListContainer')
        .on('mouseenter', 'i.access-management', function() {
            // on mouse enter show $preview box, which shows page-specific
            // permissions but doesn't yet allow user to modify them (that
            // is what the $view object opened on click is for)
            if (!$(this).hasClass('open')) {
                var page = $(this).data('page');
                var $item = $(this).parents('.PageListItem:first');
                var $link = $item.find('> a:first');
                clones[page] = $link.clone(true);
                $link.removeAttr('title').unbind('click');
                marginLeft = parseInt($link.css('width')) + 35;
                // .detail is the element containing number of page's children
                if ($link.find('.detail').length) {
                    marginLeft += parseInt($link.find('.detail').css('width'));
                }
                $(this).data('margin-left', marginLeft);
                if (!$view) {
                    var $i = $(this);
                    $preview = $('<div id="access-management" class="preview"></div>');
                    $preview
                        .css('margin-left', marginLeft)
                        .prepend('<span class="decoration">&#9664;</span>')
                        .fadeIn('fast');
                    var date = new Date();
                    if (cache[page] && cache[page]['time'] + cacheTimeout >= date.getTime()) {
                        // fetch previously loaded data from cache
                        $preview.append(cache[page].data).appendTo($item);
                    } else {
                        // data not found from cache, load now (if prev request
                        // is still running, attempt to abort and unset it)
                        if ($request && $request.readyState < 4) {
                            $request.abort();
                            $request = null;
                        }
                        $('body').addClass('access-management-loading');
                        $request = $.get(moduleConfig.processPage, { id: page }, function(data) {
                            if (!data) {
                                alert(moduleConfig.i18n.ajaxError);
                                $i.trigger('mouseleave');
                                return false;
                            }
                            setCache(page, data);
                            // under certain circumstances $preview might not
                            // exist here; check before trying to append data
                            if ($preview) $preview.append(data).appendTo($item);
                            $('body').removeClass('access-management-loading');
                        })
                    }
                }
            }
        })
        .on('mouseleave', 'i.access-management', function() {
            // hide visible preview window (unless locked, i.e. forced visible)
            // when mouse cursor is moved off access management icon
            if (!previewLock) {
                var page = $(this).data('page');
                if (clones[page] && (!$view || $view.data('page') != page)) {
                    $('.PageListID' + page + ' > a:first').replaceWith(clones[page]);
                    clones[page] = null;
                }
                if ($preview) {
                    $preview.remove();
                    $preview = null;
                }
            }
        })
        .on('click', 'i.access-management', function() {
            // access management icon was clicked, show edit view with form etc.
            // or close it if already open (in case that unsaved changes exist
            // confirm and only then close to avoid losing any data)
            var page = $(this).data('page');
            var $item = $(this).parents('.PageListItem:first');
            var viewOpen = $(this).hasClass('open');
            if ($view) {
                // $view object refers to permissions edit view and in this case
                // it has already been opened, so we're going to close it now. We
                // don't actually even need to know if it's related to page just
                // clicked, it should be removed nevertheless.
                closeView();
            }
            if (!viewOpen) {
                $('i.access-management').removeClass('open');
                $(this).addClass('open');
                var $i = $(this);
                // $view object refers to view where permissions can be modified
                $view = $('<div id="access-management" class="edit" data-page="' + page + '"></div>');
                $view
                    .css('margin-left', $(this).data('margin-left'))
                    .prepend('<span class="decoration">&#9664;</span>')
                    .prepend($close);
                $('body').addClass('access-management-overlay');
                $overlay.fadeIn('fast');
                var date = new Date();
                if (cache[page] && cache[page]['time'] + cacheTimeout >= date.getTime()) {
                    // fetch previously loaded data from cache
                    $view.append(cache[page].data).appendTo($item);
                    viewData = setData();
                    if ($preview) {
                        $preview.remove();
                        $preview = null;
                    }
                } else {
                    // data not found from cache, load now
                    previewLock = true;
                    $('body').addClass('access-management-loading');
                    $.get(moduleConfig.processPage, { id: page }, function(data) {
                        previewLock = false;
                        if (!data) {
                            alert(moduleConfig.i18n.ajaxError);
                            $i.click();
                            return false;
                        }
                        setCache(page, data);
                        $view.append(data).appendTo($item);
                        if ($preview) {
                            $preview.remove();
                            $preview = null;
                        }
                        viewData = setData();
                        $('body').removeClass('access-management-loading');
                    });
                }
            }
            return false;
        })
        .on('change', 'select[data-name=group]', function() {
            // groups select value was changed, add group to table and rebuild
            // data (unless selected option was empty)
            $option = $(this).find('> option:selected');
            if ($option.val()) {
                var $parent = $(this).parents('tr:first');
                var $editCB = $parent.find('input[data-name=edit]');
                // certain predefined groups can never gain edit permissions
                var editDisabledFor = ['everyone', 'logged'];
                var disableEdit = $.inArray($option.data('group-name'), editDisabledFor) !== -1;
                // add new group with permission defined by checkboxes next to
                // groups dropdown (note: "view" permission is always checked)
                var perms = {
                    view: true,
                    edit: !disableEdit && $editCB.prop('checked') ? true : false
                };
                var $tr = $(document.createElement('tr'));
                if (disableEdit) $tr.addClass('edit-disabled');
                $tr
                    .append('<td data-group-id="' + $option.val() + '" data-group-name="' + $option.data('group-name') + '">' + $option.text() + '</td>')
                    .append('<td><input type="checkbox" data-name="view" ' + (perms['view'] ? 'checked="checked"' : '') + '" /></td>')
                    .append('<td><input type="checkbox" data-name="edit" ' + (disableEdit ? 'disabled="disabled" title="' + moduleConfig.i18n.notAllowed + '" ' : '') + ' ' + (perms['edit'] && !disableEdit ? 'checked="checked"' : '') + ' /></td>')
                    .insertBefore($parent);
                $option.remove();
                if ($(this).find('> option').length == 1) $parent.hide();
                // update current data in hidden textarea when changes are made
                setData();
            }
        })
        .on('change', 'input[type=checkbox]', function() {
            // checkbox value in permissions form changed, rebuild data and
            // if view permission was removed return group to select menu
            if ($(this).data('name') == "view") {
                // if view permission is removed from a group, group should also
                // be removed and returned to dropdown, where it can be re-added
                var $select = $('select[data-name=group]');
                var $parent = $(this).parents('tr:first');
                var $option = $(document.createElement('option'));
                $option
                    .attr('value', $parent.find('> td:first').data('group-id'))
                    .data('group-name', $parent.find('> td:first').data('group-name'))
                    .text($parent.find('> td:first').text())
                    .appendTo($select);
                if ($select.parents('tr:first').not(':visible')) {
                    $select.parents('tr:first').show();
                }
                $parent.remove();
            }
            // update current data in hidden textarea when changes are made
            setData();
        })
        .on('click', '.access-management-close', function() {
            closeView();
        })
        .on('pageMoved', '.PageListItem', function() {
            var pageHasIcon = $(this).find('> a > i.access-management:not(.trash)').length;
            var pageIsTrash = $(this).parents('.PageList:first').prev('.PageListItem').hasClass('PageListID' + moduleConfig.trashPageID);
            var pageChanged = (pageHasIcon && pageIsTrash) || (!pageHasIcon && !pageIsTrash);
            var page = $(this).data('pageId');
            clearCache(page);
            if (pageChanged) {
                var $i = $('.PageListID' + page).find('i.access-management');
                if (pageIsTrash) $i.addClass('trash');
                else $i.removeClass('trash');
            }
        })
        .on('submit', 'form', function(event) {
            // edit permissions form has been submitted, trigger AJAX save
            event.preventDefault();
            var $i = $('i.access-management.open');
            var page = $i.data('page');
            $('body').addClass('access-management-loading');
            $.post(moduleConfig.processPage+'save', $(this).serialize(), function(data) {
                if (!data) {
                    alert(moduleConfig.i18n.ajaxError);
                    closeView();
                    return false;
                }
                // delete all cached data that might've been affected by save
                clearCache(page);
                // data.classes contains status and icon classes for access
                // management icon and data.data contains new view content
                setCache(page, data.data);
                $i
                    .removeClass(function (index, css) {
                        return (css.match (/\b(fa|icon|status)-\S+/g) || []).join(' ');
                    })
                    .addClass(data.classes)
                    .parents('.PageListItem:first')
                        .addClass('saved');
                // copy of current page list link is stored in clones; make sure
                // it doesn't contain conflicting access management toggle class
                clones[$view.data('page')].find('i:first').attr('class', $i.attr('class'));
                $view.find('button').attr('disabled', 'disabled');
                closeView();
                $('body').removeClass('access-management-loading');
            });
        });
});
