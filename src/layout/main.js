const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Shell, Meta, St, GLib, GObject, Clutter } = imports.gi;
const Main = imports.ui.main;
const { MsPanel } = Me.imports.src.layout.panel.panel;
const { reparentActor } = Me.imports.src.utils.index;
const { ShellVersionMatch } = Me.imports.src.utils.compatibility;
const { TranslationAnimator } = Me.imports.src.widget.translationAnimator;
const { AddLogToFunctions, log, logFocus } = Me.imports.src.utils.debug;

/* exported MsMain */
var MsMain = GObject.registerClass(
    {
        GTypeName: 'MsMain',
    },
    class MsMain extends St.Widget {
        _init() {
            super._init({});

            Main.uiGroup.insert_child_above(this, global.window_group);
            this.monitorsContainer = [];
            this.monitorPanelSpacerList = [];
            this.aboveContainer = new Clutter.Actor();
            this.add_child(this.aboveContainer);
            this.buildMonitorsLayout();

            //this.primaryContainer = new PrimaryContainer();
            this.monitorsContainer[
                Main.layoutManager.primaryIndex
            ].setMsWorkspaceActor(
                Me.msWorkspaceManager.getActiveMsWorkspace().msWorkspaceActor
            );

            this.panel = this.monitorsContainer[
                Main.layoutManager.primaryIndex
            ].panel;

            this.registerToSignals();
            this.onMsWorkspacesChanged();
        }

        buildMonitorsLayout() {
            for (let monitor of Main.layoutManager.monitors) {
                let topBarSpacer = new St.Widget({
                    x: monitor.x,
                    y: monitor.y,
                    width: monitor.width,
                    height: Me.msThemeManager.getPanelSize(monitor.index),
                });
                Me.msThemeManager.connect('panel-size-changed', () => {
                    topBarSpacer.set_height(
                        Me.msThemeManager.getPanelSize(monitor.index)
                    );
                });
                this.add_child(topBarSpacer);
                Main.layoutManager._trackActor(topBarSpacer, {
                    affectsStruts: true,
                    trackFullscreen: true,
                });

                this.monitorPanelSpacerList.push(topBarSpacer);
                if (monitor === Main.layoutManager.primaryMonitor) {
                    this.monitorsContainer[
                        monitor.index
                    ] = new PrimaryMonitorContainer({
                        clip_to_allocation: true,
                    });
                } else {
                    this.monitorsContainer[monitor.index] = new St.Bin({
                        clip_to_allocation: true,
                        x_fill: true,
                        y_fill: true,
                    });
                }

                this.monitorsContainer[monitor.index].set_size(
                    monitor.width,
                    monitor.height
                );
                this.monitorsContainer[monitor.index].set_position(
                    monitor.x,
                    monitor.y
                );
                this.add_child(this.monitorsContainer[monitor.index]);
            }
        }

        registerToSignals() {
            this.signals = [];

            this.signals.push({
                from: Me.msWorkspaceManager,
                id: Me.msWorkspaceManager.connect(
                    'switch-workspace',
                    (_, from, to) => {
                        this.onSwitchWorkspace(from, to);
                    }
                ),
            });

            this.signals.push({
                from: Me.msWorkspaceManager,
                id: Me.msWorkspaceManager.connect(
                    'dynamic-super-workspaces-changed',
                    () => {
                        this.onMsWorkspacesChanged();
                    }
                ),
            });

            this.signals.push({
                from: Me,
                id: Me.connect('extension-disable', () => {
                    this.aboveContainer.get_children().forEach((actor) => {
                        this.aboveContainer.remove_child(actor);
                        global.window_group.add_child(actor);
                    });
                    this.signals.forEach((signal) => {
                        signal.from.disconnect(signal.id);
                    });
                    this.monitorPanelSpacerList.forEach((actor) => {
                        actor.destroy();
                    });
                }),
            });
        }

        onMsWorkspacesChanged() {
            this.monitorsContainer.forEach((container, index) => {
                if (index === Main.layoutManager.primaryIndex) {
                    container.setMsWorkspaceActor(
                        Me.msWorkspaceManager.getActiveMsWorkspace()
                            .msWorkspaceActor
                    );
                } else {
                    container.set_child(
                        Me.msWorkspaceManager.getMsWorkspacesOfMonitorIndex(
                            index
                        )[0].msWorkspaceActor
                    );
                }
            });
        }

        onSwitchWorkspace(from, to) {
            this.onMsWorkspacesChanged();
        }

        onTransitionCompleted() {
            /*             this.remove_child(this.translationAnimator);
             */
            this.onMsWorkspacesChanged();
            const activeMsWorkspace = Me.msWorkspaceManager.getActiveMsWorkspace();
            activeMsWorkspace.refreshFocus();
        }

        add_child(actor) {
            super.add_child(actor);
            this.set_child_above_sibling(this.aboveContainer, null);
        }

        setActorAbove(actor) {
            reparentActor(actor, this.aboveContainer);
        }
        vfunc_get_preferred_width(_forHeight) {
            let width = global.stage.width;
            return [width, width];
        }

        vfunc_get_preferred_height(_forWidth) {
            let height = global.stage.height;
            return [height, height];
        }
    }
);

/* exported PrimaryMonitorContainer */
var PrimaryMonitorContainer = GObject.registerClass(
    {
        GTypeName: 'PrimaryMonitorContainer',
    },
    class PrimaryMonitorContainer extends St.Widget {
        _init(params) {
            super._init(params);
            this.panel = new MsPanel();
            this.add_child(this.panel);
            this.translationAnimator = new TranslationAnimator(true);
            this.translationAnimator.connect('transition-completed', () => {
                this.remove_child(this.translationAnimator);
                this.add_child(this.msWorkspaceActor);
                if (this.panel) {
                    this.set_child_below_sibling(
                        this.msWorkspaceActor,
                        this.panel
                    );
                }
                this.msWorkspaceActor.msWorkspace.refreshFocus();
            });
        }

        setTranslation(prevActor, nextActor) {
            if (!this.translationAnimator.get_parent()) {
                this.translationAnimator.width = this.width;
                this.translationAnimator.height =
                    Main.layoutManager.primaryMonitor.height;
                this.add_child(this.translationAnimator);
                if (this.panel) {
                    this.set_child_below_sibling(
                        this.translationAnimator,
                        this.panel
                    );
                }
            }
            let indexOfPrevActor = Me.msWorkspaceManager.primaryMsWorkspaces.findIndex(
                (msWorkspace) => {
                    return msWorkspace.msWorkspaceActor === prevActor;
                }
            );
            let indexOfNextActor = Me.msWorkspaceManager.primaryMsWorkspaces.findIndex(
                (msWorkspace) => {
                    return msWorkspace.msWorkspaceActor === nextActor;
                }
            );
            prevActor.height = nextActor.height = this.height;
            this.translationAnimator.setTranslation(
                [prevActor],
                [nextActor],
                indexOfNextActor > indexOfPrevActor ? 1 : -1
            );
        }

        setMsWorkspaceActor(actor) {
            if (actor === this.msWorkspaceActor) return;
            let prevActor;
            if (this.msWorkspaceActor) {
                prevActor = this.msWorkspaceActor;
                if (this.msWorkspaceActor.get_parent() === this)
                    this.remove_child(this.msWorkspaceActor);
            }
            this.msWorkspaceActor = actor;
            if (prevActor) {
                this.setTranslation(prevActor, this.msWorkspaceActor);
            } else {
                this.add_child(this.msWorkspaceActor);
                if (this.panel) {
                    this.set_child_below_sibling(
                        this.msWorkspaceActor,
                        this.panel
                    );
                }
            }
        }

        vfunc_allocate(box, flags) {
            this.set_allocation(box, flags);
            let themeNode = this.get_theme_node();
            box = themeNode.get_content_box(box);
            let panelBox = new Clutter.ActorBox();
            if (this.panel) {
                panelBox.x1 = box.x1;
                panelBox.x2 = this.panel.get_preferred_width(-1)[1];
                panelBox.y1 = box.y1;
                panelBox.y2 = this.panel.get_preferred_height(-1)[1];
                this.panel.allocate(panelBox, flags);
            }

            let msWorkspaceActorBox = new Clutter.ActorBox();
            msWorkspaceActorBox.x1 =
                this.panel && this.panel.visible ? panelBox.x2 : box.x1;
            msWorkspaceActorBox.x2 = box.x2;
            msWorkspaceActorBox.y1 = box.y1;
            msWorkspaceActorBox.y2 = box.y2;
            this.get_children().forEach((child) => {
                if (child === this.panel) return;
                child.allocate(msWorkspaceActorBox, flags);
            });
        }
    }
);

var PrimaryContainer = GObject.registerClass(
    {
        GTypeName: 'PrimaryContainer',
    },
    class PrimaryContainer extends Clutter.Actor {
        _init(params) {
            super._init(params);
        }

        vfunc_allocate(box, flags) {
            log('allocate primary container');
            this.set_allocation(box, flags);
            let contentBox = new Clutter.ActorBox();
            contentBox.x2 = box.get_width();
            contentBox.y2 = box.get_height();
            this.get_children().forEach((actor) => {
                let index = Me.msWorkspaceManager.primaryMsWorkspaces.findIndex(
                    (msWorkspace) => {
                        return actor === msWorkspace.msWorkspaceActor;
                    }
                );
                let actorBox = new Clutter.ActorBox();
                actorBox.x1 = contentBox.x1;
                actorBox.x2 = contentBox.x2;
                actorBox.y1 = index * contentBox.get_height();
                actorBox.y2 = actorBox.y1 + contentBox.get_height();
                actor.allocate(actorBox, flags);
            });
        }
    }
);
