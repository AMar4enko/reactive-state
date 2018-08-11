import * as React from "react";
import "mocha";
import { expect } from "chai";

import { take, map, toArray } from "rxjs/operators";
import { Store, Action } from "../src/index";
import { connect, MapStateToProps, StoreProvider, StoreSlice, WithStore } from "../react"
import * as Enzyme from "enzyme";
import { setupJSDomEnv } from "./test_enzyme_helper";
import { TestComponent, TestState, SliceState } from "./test_react_connect";

describe("react bridge: StoreProvider and StoreSlice tests", () => {

    const nextMessage = new Action<string>();
    let store: Store<TestState>;
    let wrapper: Enzyme.ReactWrapper | null | undefined;
    beforeEach(() => {
        setupJSDomEnv();
        store = Store.create<TestState>({
            message: "initialMessage",
            slice: {
                sliceMessage: "initialSliceMessage"
            }
        })
        store.addReducer(nextMessage, (state, message) => {
            return {
                ...state,
                message
            }
        })
    })

    afterEach(() => {
        store.destroy();
        if (wrapper) {
            wrapper.unmount()
            wrapper = undefined;
        }
    })

    it("can use StoreSlice with an object slice and delete slice state after unmount", (done) => {

        const nextSliceMessage = new Action<string>("NEXT_SLICE_MESSAGE");

        const ConnectedTestComponent = connect(TestComponent, (store: Store<SliceState>) => {
            const mapStateToProps: MapStateToProps<TestComponent, SliceState> = (store) => {
                return store.select().pipe(
                    map(state => ({ message: state.sliceMessage }))
                )
            }
            store.addReducer(nextSliceMessage, (state, newMessage) => {
                return {
                    ...state,
                    sliceMessage: newMessage,
                };
            })
            return {
                mapStateToProps
            }
        });

        store.select(s => s.slice).pipe(
            take(4),
            toArray()
        ).subscribe(arr => {
            expect(arr[0]!.sliceMessage).to.equal("initialSliceMessage");
            expect(arr[1]!.sliceMessage).to.equal("1");
            expect(arr[2]!.sliceMessage).to.equal("objectslice");
            expect(arr[3]).to.be.undefined;
            setTimeout(() => {
                done();
            }, 50)
        })

        const initialSliceState: SliceState = {
            sliceMessage: "1"
        };

        wrapper = Enzyme.mount(
            <StoreProvider store={store}>
                <StoreSlice slice={(store: Store<TestState>) => "slice"} initialState={initialSliceState } cleanupState={"delete"}>
                    <ConnectedTestComponent />
                </StoreSlice>
            </StoreProvider>
        )
        nextSliceMessage.next("objectslice");
        const messageText = wrapper.find("h1").text();
        expect(messageText).to.equal("objectslice");
        wrapper.unmount();
        wrapper = null;
    })

    it("should be possible for two StoreProvider as siblings to offer different stores", done => {
        const store1 = Store.create({ foo: "foo" })
        const store2 = Store.create({ bar: "bar" })
        wrapper = Enzyme.mount(<div>
            <StoreProvider store={store1}>
                <WithStore>{store => {
                    store.select().pipe(take(1)).subscribe(state => {
                        expect(state.foo).to.equal("foo");
                    })
                    return <h1>foo</h1>
                }}
                </WithStore>
                }}
            </StoreProvider>
            <StoreProvider store={store2}>
                <WithStore>{store => {
                    store.select().pipe(take(1)).subscribe(state => {
                        expect(state.bar).to.equal("bar");
                        setTimeout(() => {
                            done();
                        }, 50)
                    })
                    return <h1>bar</h1>
                }}
                </WithStore>
            </StoreProvider>
        </div>
        )
    })

    it("should allow StoreProvider to be nested and return the correct instances for WithStore", () => {
        const store1 = Store.create({ level: "level1" })
        const store2 = Store.create({ level: "level2" })

        wrapper = Enzyme.mount(<div>
            <StoreProvider store={store1}>
                <WithStore>{level1Store => {
                    level1Store.select().pipe(take(1)).subscribe(state => {
                        expect(state.level).to.equal("level1");
                    })
                    return <StoreProvider store={store2}>
                        <WithStore>{level2Store => {
                            level2Store.select().pipe(take(1)).subscribe(state => {
                                expect(state.level).to.equal("level2");
                            })
                            return <h1>Foobar</h1>
                        }}
                        </WithStore>
                    </StoreProvider>
                }}
                </WithStore>
                }}
            </StoreProvider>
        </div>
        )
    })

    it("should allow StoreProvider to be nested and return the correct instances for connect", () => {
        const store1 = Store.create({ level: "level1" })
        const store2 = Store.create({ level: "level2" })
        const ConnectedTestComponent = connect(TestComponent, (store: Store<{ level: string }>) => {
            const mapStateToProps: MapStateToProps<TestComponent> = (mapStateToPropsStore: Store<any>) => {
                return store.select().pipe(
                    map(state => ({ message: state.level }))
                );
            }
            return {
                mapStateToProps
            }
        })

        wrapper = Enzyme.mount(<StoreProvider store={store1}>
            <ConnectedTestComponent />
            <StoreProvider store={store2}>
                <ConnectedTestComponent />
            </StoreProvider>
        </StoreProvider>)

        const text1 = wrapper.find("h1").at(0).text();
        const text2 = wrapper.find("h1").at(1).text();
        expect(text1).to.equal("level1");
        expect(text2).to.equal("level2");
    })


    it("should assert the store slice is destroyed when the StoreSlice component unmounts", (done) => {
        const ConnectedTestComponent = connect(TestComponent, (store: Store<SliceState>) => {
            store.destroyed.subscribe(() => done());
            return {}
        });

        wrapper = Enzyme.mount(
            <StoreProvider store={store}>
                <StoreSlice slice={(store: Store<TestState>) => "slice"}>
                    <ConnectedTestComponent />
                </StoreSlice>
            </StoreProvider>
        )
        wrapper.update();
        wrapper.update();
        wrapper.unmount();
        wrapper = null;
    })

    it("can use StoreSlice with a string slice", () => {
        const ConnectedTestComponent = connect(TestComponent, () => {
            const mapStateToProps = (store: Store<string>) => {
                return store.select().pipe(
                    map(message => ({ message }))
                )
            }
            return {
                mapStateToProps
            }
        });

        wrapper = Enzyme.mount(
            <StoreProvider store={store}>
                <StoreSlice slice={(store: Store<TestState>) => "message"}>
                    <ConnectedTestComponent />
                </StoreSlice>
            </StoreProvider>
        )
        nextMessage.next("stringslice");
        const messageText = wrapper.find("h1").text();
        expect(messageText).to.equal("stringslice");
    })


    it("should be possible to get a context store instance with the WithStore render prop", (done) => {
        const SampleSFC: React.SFC<{ store: Store<TestState> }> = (props) => {
            expect(store).to.be.ok;
            store.destroy();
            return null;
        }
        store.destroyed.subscribe(() => done());

        wrapper = Enzyme.mount(<div><StoreProvider store={store}>
            <WithStore>{theStore => <SampleSFC store={theStore} />}</WithStore>
        </StoreProvider></div>
        )
    })

    it("should throw an error if StoreSlice is used outside of a StoreProvider context", () => {
        expect(() => {
            Enzyme.mount(
                <StoreSlice slice={(store: Store<TestState>) => "slice"} />
            )
        }).to.throw();
    })

    it("should throw an error if WithStore is used outside of a StoreProvider context", () => {
        const SampleSFC: React.SFC<{ store: Store<TestState> }> = (props) => {
            return null;
        }
        expect(() => {
            Enzyme.mount(<WithStore>{theStore => <SampleSFC store={theStore} />}</WithStore>);
        }).to.throw();
    })

    it("should throw an error if WithStore is used but no function is supplied as child", () => {
        expect(() => {
            Enzyme.mount(<StoreProvider store={store}>
                <WithStore><h1>Not a function</h1></WithStore>
            </StoreProvider>)
        }).to.throw();
    })


})